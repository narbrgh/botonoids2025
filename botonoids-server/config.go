package main

type DirType string
type ModeType string
type Phase string
type Role string
type Model string
type ItemType string
type SillyPadAction string

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
	PhaseLobby     Phase = "phaseLobby"
	PhaseCountdown Phase = "phaseCountdown"
	PhasePlaying   Phase = "phasePlaying"
	PhaseFinished  Phase = "phaseFinished"
)

const (
	RoleGoldBot   Role = "goldBot"
	RoleSilverBot Role = "silverBot"
	RoleWhiteBot  Role = "whiteBot"
	RoleBlackBot  Role = "blackBot"
	RoleRandomBot Role = "randomBot"
	RoleObserver  Role = "observer"
)

const (
	ModelAlphanoid  Model = "alphanoid"
	ModelHerbanoid  Model = "herbanoid"
	ModelBarvinoid  Model = "barvinoid"
	ModelRandomnoid Model = "randomnoid"
)

const (
	ItemSillyPad    ItemType = "itemSillyPad"
	ItemWallbreaker ItemType = "itemWallbreaker"
	ItemGhost       ItemType = "itemGhost"
)

const (
	SillyPadCreate SillyPadAction = "create"
	SillyPadRemove SillyPadAction = "remove"
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
