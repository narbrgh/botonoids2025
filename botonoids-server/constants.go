package main

// ---------00-0-0-0-0-0-0-0-0------
// --- CONSTANTS -------000--0--00--
// --00-0-0-0---------------00-0-0--

const (
	TickHz               = 20
	MoveTicks            = 6 // 500 ms at 20 Hz -> 10 ticks. If you change this here, change in Constants.ts (TODO: make this take in the Constants file movement speed)
	ColorChangeTicks     = 35
	CooldownTicks        = 45
	SillyPadTicks        = 65 * TickHz //65 seconds * TickHz
	WallbreakerTicks     = 3 * TickHz
	WorldCols            = 30 // temporary bounds for now (TODO update this later)
	WorldRows            = 16
	SpawnBaseX           = 6
	SpawnBaseY           = 3
	SpawnCols            = 12
	NewSeed              = 10 //TODO make random seed
	NumColors            = 5
	MinimumCombo         = 6
	MaxNumColorChanges   = 5
	DEFAULT_SILLY_PADS   = 10
	DEFAULT_WALLBREAKERS = 100
	PointsPerWall        = 1
	PointsPerGarden      = 2
)
