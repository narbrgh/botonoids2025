package main

import "botonoids-server/internal/rooms"

func makeConfig() ConfigMsg {
	return ConfigMsg{
		Type: "config",

		TickHz:    rooms.TickHz,
		MoveTicks: rooms.MoveTicks,

		MoveDurMs:           int(rooms.MoveTicks) * 1000 / rooms.TickHz,
		ColorCooldownMs:     1200,
		MaxTilesColorChange: 5,
		TileSize:            32,

		Seed: rooms.NewSeed,
		Cols: rooms.WorldCols,
		Rows: rooms.WorldRows,

		ConfigVersion: 1,
	}
}
