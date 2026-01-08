package main

import "math/rand"

type TileMap struct {
	Cols, Rows int
	Tiles      [][]uint8
}

func NewTileMap(cols, rows int, seed int64) *TileMap {
	rng := rand.New(rand.NewSource(seed))
	t := make([][]uint8, rows)
	for y := 0; y < rows; y++ {
		t[y] = make([]uint8, cols)
		for x := 0; x < cols; x++ {
			t[y][x] = uint8(rng.Intn(5))
		}
	}
	return &TileMap{Cols: cols, Rows: rows, Tiles: t}
}
