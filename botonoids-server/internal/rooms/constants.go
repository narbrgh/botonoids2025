package rooms

// ---------00-0-0-0-0-0-0-0-0------
// --- CONSTANTS -------000--0--00--
// --00-0-0-0---------------00-0-0--

const (
	TickHz                    = 20
	MoveTicks                 = 6 // 500 ms at 20 Hz -> 10 ticks. If you change this here, change in Constants.ts (TODO: make this take in the Constants file movement speed)
	ColorChangeTicks          = 35
	CooldownTicks             = 45
	GhostTicks                = 40 * TickHz // 40 seconds * TickHz
	SillyPadTicks             = 80 * TickHz //65 seconds * TickHz
	WallbreakerTicks          = 3 * TickHz
	WorldCols                 = 30 // temporary bounds for now (TODO update this later)
	WorldRows                 = 16
	SpawnBaseX                = 6
	SpawnBaseY                = 3
	SpawnCols                 = 12
	NewSeed                   = 10 //TODO make random seed
	NumColors                 = 5
	MinimumCombo              = 6
	MaxNumColorChanges        = 5
	DEFAULT_SILLY_PADS        = 5
	DEFAULT_WALLBREAKERS      = 1
	PointsPerWall             = 1
	PointsPerGarden           = 2
	GardenDestroyTicksPerTile = 1 // how slowly a garden is destroyed by a wallbreaker. Higher numbers mean it takes longer for the "explosion" of gardens to propogate
	ExplosionRadius           = 2 // how far reaching an explosion is (in terms of turning a player into a ghost)
)
