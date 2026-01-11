package main

// ---------00-0-0-0-0-0-0-0-0------
// --- CONSTANTS -------000--0--00--
// --00-0-0-0---------------00-0-0--

const (
	TickHz     = 20
	MoveTicks  = 10 // 500 ms at 20 Hz -> 10 ticks. If you change this here, change in Constants.ts (TODO: make this take in the Constants file movement speed)
	WorldCols  = 30 // temporary bounds for now (TODO update this later)
	WorldRows  = 16
	SpawnBaseX = 6
	SpawnBaseY = 6
	SpawnCols  = 12
	NewSeed    = 10 //TODO make random seed
)
