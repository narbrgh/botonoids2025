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
	Cols  int      `json:"cols"`
	Rows  int      `json:"rows"`
	Tiles [][]Tile `json:"tiles"`
}

func NewTileMap(cols, rows int, seed int64) *TileMap {
	rng := rand.New(rand.NewSource(seed))
	t := make([][]Tile, rows)
	for y := 0; y < rows; y++ {
		t[y] = make([]Tile, cols)
		for x := 0; x < cols; x++ {
			t[y][x].Index = uint8(rng.Intn(NumColors))
			t[y][x].Changing = false
			t[y][x].TileChangeStartTick = 0
			t[y][x].TileChangeDurTicks = 0
		}
	}
	return &TileMap{Cols: cols, Rows: rows, Tiles: t}
}

func (tm *TileMap) SetTile(x, y int, index uint8) bool {
	if x < 0 || x >= tm.Cols || y < 0 || y >= tm.Rows {
		return false
	}
	tm.Tiles[y][x].Index = index
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

func TileMapInitiateColorChange(tm *TileMap, x, y int, index uint8, startTick uint64, numTicks uint64) {
	tm.Tiles[y][x].Index = index
	tm.Tiles[y][x].Changing = true
	tm.Tiles[y][x].TileChangeStartTick = startTick
	tm.Tiles[y][x].TileChangeDurTicks = numTicks
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
