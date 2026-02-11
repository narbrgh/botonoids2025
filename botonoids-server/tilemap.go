package main

import (
	"math/rand"
)

type Tile struct {
	Index               uint8  `json:"index"`
	Changing            bool   `json:"changing"`
	TileChangeStartTick uint64 `json:"tileChangeStartTick"`
	TileChangeDurTicks  uint64 `json:"tileChangeDurTicks"`
}

type SillyPadState struct {
	Active        bool   `json:"active"`
	OwnerId       int    `json:"ownerID"`
	StartTick     uint64 `json:"-"` // start tick is needed so that if two players place a silly pad on the SAME tick, only the first one is accepted, so there are no "conflicts" between server and client
	ExpiresAtTick uint64 `json:"expiresAtTick"`
}

type SillyPadPos struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type TileMap struct {
	Cols        int               `json:"cols"`
	Rows        int               `json:"rows"`
	Tiles       [][]Tile          `json:"tiles"`
	tempTileMap [][]bool          `json:"-"` // tempTileMap is used to check for combos and walls, then implement them without running the flood fill algo twice
	pending     []TileDelta       `json:"-"`
	SillyPads   [][]SillyPadState `json:"sillyPads"`
	rng         *rand.Rand        `json:"-"`

	//variables for checking for garden
	leftEdgeHit   bool `json:"-"`
	rightEdgeHit  bool `json:"-"`
	topEdgeHit    bool `json:"-"`
	bottomEdgeHit bool `json:"-"`
	enemyWallHit  bool `json:"-"`

	// Regarding gardens:
	//
	// TempTileMap  shows true / false for what what "checked"
	// RegionTileMap makes it so only the "region" (continuous area) that met criteria to become a garden actually
	// becomes a garden
	regionTileMap [][]bool `json:"-"`

	// gardenTileMap are the actual tiles that become garden
	gardenTileMap [][]bool `json:"-"`
}

type TileDelta struct { //TileDelta is used for the multiple-tile-change-broadcast (such as combos and walls)
	X     int   `json:"x"`
	Y     int   `json:"y"`
	Index uint8 `json:"index"`
}

func (tm *TileMap) AddChange(x, y int, index uint8) {
	tm.pending = append(tm.pending, TileDelta{X: x, Y: y, Index: index})
}

func (tm *TileMap) ResetChangeMap() {
	tm.pending = tm.pending[:0]
}

func NewTileMap(cols, rows int, seed int64) *TileMap {
	rng := rand.New(rand.NewSource(seed))
	t := make([][]Tile, rows)
	temp := make([][]bool, rows)
	garden := make([][]bool, rows)
	region := make([][]bool, rows)
	sillyPads := make([][]SillyPadState, rows)

	for y := 0; y < rows; y++ {
		t[y] = make([]Tile, cols)
		temp[y] = make([]bool, cols)
		garden[y] = make([]bool, cols)
		region[y] = make([]bool, cols)
		sillyPads[y] = make([]SillyPadState, cols)

		for x := 0; x < cols; x++ {
			t[y][x].Index = uint8(rng.Intn(NumColors))
			t[y][x].Changing = false
			t[y][x].TileChangeStartTick = 0
			t[y][x].TileChangeDurTicks = 0
			temp[y][x] = false

			sillyPads[y][x].Active = false
			sillyPads[y][x].StartTick = 0
			sillyPads[y][x].ExpiresAtTick = 0
			sillyPads[y][x].OwnerId = -1

			//variables for checking for garden
			garden[y][x] = false
			region[y][x] = false
		}
	}
	return &TileMap{Cols: cols, Rows: rows, Tiles: t, tempTileMap: temp, gardenTileMap: garden, regionTileMap: region, SillyPads: sillyPads, rng: rng}
}

func (tm *TileMap) SetTile(x, y int, index uint8) bool {
	if x < 0 || x >= tm.Cols || y < 0 || y >= tm.Rows {
		return false
	}
	tm.Tiles[y][x].Index = index
	return true
}

func (tm *TileMap) SetTileAndAddChange(x, y int, index uint8) bool {
	if x < 0 || x >= tm.Cols || y < 0 || y >= tm.Rows {
		return false
	}
	tm.Tiles[y][x].Index = index
	tm.AddChange(x, y, index)
	return true
}

func (tm *TileMap) GetTileIndexAfterColorChange(x, y int) (uint8, bool) {
	if x < 0 || x >= tm.Cols || y < 0 || y >= tm.Rows {
		return 0, false
	}

	if tm.Tiles[y][x].Index == NumColors-1 {
		return 0, true
	}
	return tm.Tiles[y][x].Index + 1, true

}

func (tm *TileMap) GetTileIndex(x, y int) (uint8, bool) {
	if x < 0 || x >= tm.Cols || y < 0 || y >= tm.Rows {
		return 0, false
	}

	return tm.Tiles[y][x].Index, true
}

func IsTileAFoundationWallOrFlower(i uint8) bool {
	if i > (NumColors - 1) {
		return true
	}
	return false
}

func IsTileAWall(i uint8) bool {
	return i == 6 || i == 9 || i == 12 || i == 15
}

func isTileGardenable(i uint8) bool {
	//if it's a color tile (0 through 4) or is a foundation (hardcoded here) then it's gardenable.
	return (i < NumColors || i == 5 || i == 8 || i == 11 || i == 14)
}

func CheckColorChangeResult(x, y int, tm *TileMap) ColorChangeResult {
	i, ok := tm.GetTileIndex(x, y)

	if ok == false {
		return ColorChangeUnsuccessfulDoNotDecrement
	} // out of bounds

	if IsTileAFoundationWallOrFlower(i) {
		return ColorChangeUnsuccessfulDoNotDecrement
	} //Walk around walls, foundations, and flowers without decrementing

	if tm.Tiles[y][x].Changing == true {
		return ColorChangeUnsuccessfulStillDecrement
	} // Walking on tiles prior to their color change finishes will still decrement the numColorChangesLeft, but will not change the tile

	return ColorChangeSuccessful
}

func TileMapInitiateColorChange(tm *TileMap, x, y int, index uint8, startTick uint64, numTicks uint64, playerID int) int { // returns the combo length if it was a combo
	//first check for combo
	comboSize := tm.CheckForCombo(x, y, index)
	//if it was a combo, return and tell gameloop the combo size
	if comboSize >= MinimumCombo {
		return comboSize
	}

	//it was not a combo. reset the temp map to all false, and proceed on with initiating the color change

	tm.ResetTempTileMap()

	tm.Tiles[y][x].Index = index
	tm.Tiles[y][x].Changing = true
	tm.Tiles[y][x].TileChangeStartTick = startTick
	tm.Tiles[y][x].TileChangeDurTicks = numTicks

	return 0
}

func (tm *TileMap) CreateSillyPad(x, y int, playerId int, startTick uint64, numTicks uint64) bool {
	//Note! Placing a SillyPad will over-write the previous SillyPad, IF it's someone else's silly pad
	// You can't "refresh" your own silly pads until they expire

	if !tm.InBounds(x, y) {
		return false
	}

	if tm.SillyPads[y][x].Active && tm.SillyPads[y][x].StartTick == startTick {
		// if another player made a silly pad on the EXACT SAME TICK, then don't make one, and return false
		//this will prevent "collisions" where two silly pads are made concurrently, and then the order that each
		//client receives the silly pad message would determine (non-deterministically) which player's silly pad "sticks"

		return false
	}

	if tm.SillyPads[y][x].Active && tm.SillyPads[y][x].OwnerId == playerId {
		//you can't refresh your own silly pad until it expires
		return false
	}

	tm.SillyPads[y][x].Active = true
	tm.SillyPads[y][x].OwnerId = playerId
	tm.SillyPads[y][x].ExpiresAtTick = startTick + numTicks

	return true
}

func (tm *TileMap) CheckForCombo(x, y int, index uint8) int { //returns combo size
	n := 1 //combo size

	tm.tempTileMap[y][x] = true
	n = n + tm.FloodFill(x+1, y, index) + tm.FloodFill(x-1, y, index) + tm.FloodFill(x, y+1, index) + tm.FloodFill(x, y-1, index)
	return n
}

func (tm *TileMap) ResetEdges() {
	tm.leftEdgeHit = false
	tm.rightEdgeHit = false
	tm.bottomEdgeHit = false
	tm.topEdgeHit = false
	tm.enemyWallHit = false
}

func (tm *TileMap) CountEdgesHit() int {
	c := 0

	if tm.bottomEdgeHit {
		c++
	}
	if tm.leftEdgeHit {
		c++
	}
	if tm.rightEdgeHit {
		c++
	}
	if tm.topEdgeHit {
		c++
	}

	return c
}

func (tm *TileMap) CheckForGarden(x, y int, foundationIndex uint8, wallIndex uint8, gardenIndex uint8, ID int) (bool, int) { // returns true if garden; returns number of foundation tiles destroyed as the int
	//this will check left, up, down, and right to see if a garden can be made at each
	//first reset the "temp" map
	tm.ResetTempRegionAndGardenTileMap()

	tm.tempTileMap[y][x] = true

	madeGarden := false
	n := 0

	// check left
	tm.ResetEdges()
	tm.ResetRegionTileMap()

	if x > 0 && tm.tempTileMap[y][x-1] == false && isTileGardenable(tm.Tiles[y][x-1].Index) {
		tm.GardenFloodFill(x-1, y, wallIndex)
		n = tm.CountEdgesHit()
		if !tm.enemyWallHit && n <= 2 {
			//garden!
			madeGarden = true
			tm.MergeRegionToGardenTileMap()
		}
	}

	//check right
	tm.ResetEdges()
	tm.ResetRegionTileMap()
	if x < tm.Cols-1 && tm.tempTileMap[y][x+1] == false && isTileGardenable(tm.Tiles[y][x+1].Index) {
		tm.GardenFloodFill(x+1, y, wallIndex)
		n = tm.CountEdgesHit()
		if !tm.enemyWallHit && n <= 2 {
			//garden!
			madeGarden = true
			tm.MergeRegionToGardenTileMap()
		}
	}

	//check up
	tm.ResetEdges()
	tm.ResetRegionTileMap()
	if y > 0 && tm.tempTileMap[y-1][x] == false && isTileGardenable(tm.Tiles[y-1][x].Index) {

		tm.GardenFloodFill(x, y-1, wallIndex)
		n = tm.CountEdgesHit()
		if !tm.enemyWallHit && n <= 2 {
			//garden!
			madeGarden = true
			tm.MergeRegionToGardenTileMap()
		}
	}

	//check down
	tm.ResetEdges()
	tm.ResetRegionTileMap()
	if y < tm.Rows-1 && tm.tempTileMap[y+1][x] == false && isTileGardenable(tm.Tiles[y+1][x].Index) {
		tm.GardenFloodFill(x, y+1, wallIndex)
		n = tm.CountEdgesHit()
		if !tm.enemyWallHit && n <= 2 {
			//garden!
			madeGarden = true
			tm.MergeRegionToGardenTileMap()
		}
	}

	numFoundationsDestroyed := 0

	if madeGarden {

		for yC := range tm.tempTileMap {
			for xC := range tm.tempTileMap[yC] {
				if tm.gardenTileMap[yC][xC] == true {
					if tm.Tiles[yC][xC].Index == foundationIndex {
						numFoundationsDestroyed++
					}
					tm.Tiles[yC][xC].Index = gardenIndex
					tm.AddChange(xC, yC, gardenIndex)
				}
			}
		}
	}

	return madeGarden, numFoundationsDestroyed
}

func (tm *TileMap) GardenFloodFill(x, y int, wallIndex uint8) {

	// if the floodfill hits 2 "edges"", it's a garden. if it hits 3 edges, or hits an opponent wall, it's not.
	if tm.InBounds(x, y) == false {
		if x < 0 {
			tm.leftEdgeHit = true
			return
		}
		if x > tm.Cols-1 {
			tm.rightEdgeHit = true
			return
		}
		if y < 0 {
			tm.topEdgeHit = true
			return
		}
		if y > tm.Rows-1 {
			tm.bottomEdgeHit = true
			return
		}
	}

	//already checked this square
	if tm.tempTileMap[y][x] == true {
		return
	}

	//now set this square that is has been checked
	tm.tempTileMap[y][x] = true
	tm.regionTileMap[y][x] = true

	i, ok := tm.GetTileIndex(x, y) //check for walls, friendly or not
	if ok {
		if IsTileAWall(i) {
			if i == wallIndex {
				return
			}
			//if it's a wall, but not a "friendly wall" (as passed by wallIndex), then the garden is a failure
			tm.enemyWallHit = true
			return
		}
	}

	//now flood out 4-ways
	tm.GardenFloodFill(x-1, y, wallIndex)
	tm.GardenFloodFill(x+1, y, wallIndex)
	tm.GardenFloodFill(x, y-1, wallIndex)
	tm.GardenFloodFill(x, y+1, wallIndex)

}

func (tm *TileMap) MergeRegionToGardenTileMap() {
	for y := range tm.regionTileMap {
		for x := range tm.regionTileMap[y] {
			if tm.regionTileMap[y][x] && isTileGardenable(tm.Tiles[y][x].Index) {
				tm.gardenTileMap[y][x] = true
			}
		}
	}
}

func (tm *TileMap) ResetTempTileMap() {
	for y := range tm.tempTileMap {
		for x := range tm.tempTileMap[y] {
			tm.tempTileMap[y][x] = false
		}
	}
}

func (tm *TileMap) ResetTempRegionAndGardenTileMap() {
	for y := range tm.tempTileMap {
		for x := range tm.tempTileMap[y] {
			tm.tempTileMap[y][x] = false
			tm.gardenTileMap[y][x] = false
			tm.regionTileMap[y][x] = false
		}
	}
}

func (tm *TileMap) ResetGardenTileMap() {
	for y := range tm.tempTileMap {
		for x := range tm.tempTileMap[y] {
			tm.gardenTileMap[y][x] = false
		}
	}
}

func (tm *TileMap) ResetRegionTileMap() {
	for y := range tm.regionTileMap {
		for x := range tm.regionTileMap[y] {
			tm.regionTileMap[y][x] = false
		}
	}
}

func (tm *TileMap) FloodFill(x, y int, index uint8) int {
	if tm.InBounds(x, y) == false {
		return 0
	} // if out of bounds return back with a 0
	if tm.tempTileMap[y][x] == true {
		return 0
	} // if the tile was already "checked" (tempTileMap is true at that location) return with a 0
	if tm.Tiles[y][x].Index != index {
		return 0
	} // if the tile doesn't match the index, return with a 0

	//after this point, it's a MATCH! so add at least 1, make the tempTileMap true, and add the neighbors
	tm.tempTileMap[y][x] = true
	n := 1
	n = n + tm.FloodFill(x+1, y, index) + tm.FloodFill(x-1, y, index) + tm.FloodFill(x, y+1, index) + tm.FloodFill(x, y-1, index)

	return n
}

func (tm *TileMap) InBounds(x, y int) bool {
	if x < 0 || x > tm.Cols-1 || y < 0 || y > tm.Rows-1 {
		return false
	}

	return true
}

func (tm *TileMap) Update(currentTick uint64) (bool, []SillyPadPos) {

	returnValue := false
	expired := make([]SillyPadPos, 0, 8)

	for x := 0; x < tm.Cols; x++ {
		for y := 0; y < tm.Rows; y++ {
			if tm.Tiles[y][x].Changing == true {
				deltaTime := currentTick - tm.Tiles[y][x].TileChangeStartTick
				if deltaTime >= tm.Tiles[y][x].TileChangeDurTicks { // tile change is done
					tm.Tiles[y][x].Changing = false
				}
			}
			if tm.SillyPads[y][x].Active {
				if currentTick >= tm.SillyPads[y][x].ExpiresAtTick {
					tm.SillyPads[y][x].Active = false
					returnValue = true // returns true if silly pad "times out" -- this way gameloop.go knows to send signal to client
					expired = append(expired, SillyPadPos{X: x, Y: y})
				}
			}
		}
	}
	return returnValue, expired
}

func (tm *TileMap) CheckMovement(nx int, ny int, id int, playerWallIndex uint8) bool {
	if !tm.InBounds(nx, ny) {
		return false
	}

	if IsTileAWall(tm.Tiles[ny][nx].Index) {
		if tm.Tiles[ny][nx].Index != playerWallIndex {
			return false
		}
	}

	if tm.SillyPads[ny][nx].Active {
		if tm.SillyPads[ny][nx].OwnerId != id {
			return false
		}
	}

	return true

}

func (tm *TileMap) InitiateCombo(foundationTileIndex uint8) {
	for y := range tm.Tiles {
		for x := range tm.Tiles[y] {
			if tm.tempTileMap[y][x] == true {
				tm.SetTile(x, y, foundationTileIndex)
				tm.AddChange(x, y, foundationTileIndex) //updates the "pending" list which is ultimately sent to the clients to tell them about the change
			}
			tm.tempTileMap[y][x] = false
		}
	}

}

func (tm *TileMap) TryToBuildWall(x int, y int, FoundationIndex uint8, WallIndex uint8, playerID int) bool {
	i, ok := tm.GetTileIndex(x, y)

	if ok == false {
		return false
	}

	//if i == pl.FoundationIndex { //TODO use pl.FoundationIndex
	if i == uint8(FoundationIndex) {
		tm.SetTileAndAddChange(x, y, WallIndex) //TODO use pl.WallIndex
		return true
	}

	return false
}

func (tm *TileMap) ResetFoundationTiles(foundationTileIndex uint8) {
	for y := range tm.Tiles {
		for x := range tm.Tiles[y] {
			if tm.Tiles[y][x].Index == foundationTileIndex {
				r := uint8(tm.rng.Intn(NumColors))
				tm.SetTile(x, y, r)
				tm.AddChange(x, y, r)
			}

		}
	}
}
