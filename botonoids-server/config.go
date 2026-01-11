package main

type DirType string
type ModeType string
type Phase string

const (
	Up    DirType = "up"
	Down  DirType = "down"
	Left  DirType = "left"
	Right DirType = "right"
)

const (
	Walking       ModeType = "walking"
	ColorChanging ModeType = "colorChanging"
	WallBuilding  ModeType = "wallBuilding"
	Ghost         ModeType = "ghost"
	Cooldown      ModeType = "cooldown"
)

const (
	PhaseLobby     Phase = "lobby"
	PhaseCountdown Phase = "countdown"
	PhasePlaying   Phase = "playing"
	PhaseFinished  Phase = "finished"
)

func makeConfig() ConfigMsg {
	return ConfigMsg{
		Type: "config",

		TickHz:    TickHz,
		MoveTicks: MoveTicks,

		MoveDurMs:           int(MoveTicks) * 1000 / TickHz,
		ColorCooldownMs:     1200, //example
		MaxTilesColorChange: 5,
		TileSize:            32,

		Seed: NewSeed,
		Cols: WorldCols,
		Rows: WorldRows,

		ConfigVersion: 1,
	}
}
