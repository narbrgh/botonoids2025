package main

import "math/rand"

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
			t[y][x].Index = uint8(rng.Intn(5))
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
