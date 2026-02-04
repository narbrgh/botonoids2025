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

type TileMap struct {
	Cols        int         `json:"cols"`
	Rows        int         `json:"rows"`
	Tiles       [][]Tile    `json:"tiles"`
	tempTileMap [][]bool    `json:"-"` // tempTileMap is used to check for combos and walls, then implement them without running the flood fill algo twice
	pending     []TileDelta `json:"-"`
	rng         *rand.Rand  `json:"-"`
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
	for y := 0; y < rows; y++ {
		t[y] = make([]Tile, cols)
		temp[y] = make([]bool, cols)
		for x := 0; x < cols; x++ {
			t[y][x].Index = uint8(rng.Intn(NumColors))
			t[y][x].Changing = false
			t[y][x].TileChangeStartTick = 0
			t[y][x].TileChangeDurTicks = 0
			temp[y][x] = false
		}
	}
	return &TileMap{Cols: cols, Rows: rows, Tiles: t, tempTileMap: temp, rng: rng}
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

func (tm *TileMap) CheckForCombo(x, y int, index uint8) int { //returns combo size
	n := 1 //combo size

	tm.tempTileMap[y][x] = true
	n = n + tm.FloodFill(x+1, y, index) + tm.FloodFill(x-1, y, index) + tm.FloodFill(x, y+1, index) + tm.FloodFill(x, y-1, index)
	return n
}

func (tm *TileMap) CheckForGarden(x, y int, foundationIndex int, wallIndex int, gardenIndex int, ID int) bool {
	//this will check left, up, down, and right to see if a garden can be made at each
	//first reset the "temp" map
	tm.ResetTempTileMap()

	//now check left
	leftGarden := tm.GardenFloodFill(x, y, gardenIndex)
}

func (tm *TileMap) GardenFloodFill(x, y int, gardenIndex int) bool {
	//to count as a garden, the floodfill algo is not allowed to hit three "side-walls"
	leftWallHit := false
}

func (tm *TileMap) ResetTempTileMap() {
	for y := range tm.tempTileMap {
		for x := range tm.tempTileMap[y] {
			tm.tempTileMap[y][x] = false
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

func (tm *TileMap) Update(currentTick uint64) {

	for x := 0; x < tm.Cols; x++ {
		for y := 0; y < tm.Rows; y++ {
			if tm.Tiles[y][x].Changing == true {
				deltaTime := currentTick - tm.Tiles[y][x].TileChangeStartTick
				if deltaTime >= tm.Tiles[y][x].TileChangeDurTicks { // tile change is done
					tm.Tiles[y][x].Changing = false
				}
			}
		}
	}
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
