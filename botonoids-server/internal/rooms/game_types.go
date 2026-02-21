package rooms

type DirType string
type ModeType string
type Phase string
type Role string
type Model string
type ItemType string
type CreateOrRemove string

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
	RolePinkBot   Role = "pinkBot"
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
	ItemCreate CreateOrRemove = "create"
	ItemRemove CreateOrRemove = "remove"
)
