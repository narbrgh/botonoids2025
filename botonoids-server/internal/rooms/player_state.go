package rooms

func IsValidDir(d DirType) bool {
	switch d {
	case Up, Down, Left, Right:
		return true
	default:
		return false
	}
}

type PlayerState struct {
	ID        int      `json:"id"`
	Name      string   `json:"name,omitempty"`
	X         int      `json:"x"`
	Y         int      `json:"y"`
	Facing    DirType  `json:"facing"`
	IntentDir *DirType `json:"intentDir,omitempty"`

	Moving        bool   `json:"moving"`
	FromX         int    `json:"fromX"`
	FromY         int    `json:"fromY"`
	ToX           int    `json:"toX"`
	ToY           int    `json:"toY"`
	MoveStartTick uint64 `json:"moveStartTick"`
	MoveDurTicks  uint64 `json:"moveDurTicks"`

	Mode                ModeType `json:"mode"`
	NumColorChangesLeft int      `json:"numColorChangesLeft"`
	NumWallsLeft        int      `json:"numWallsLeft"`
	CooldownStartTick   uint64   `json:"cooldownStartTick"`
	CooldownDurTicks    uint64   `json:"cooldownDurTicks"`

	Score               int      `json:"score"`
	SelectedItem        ItemType `json:"selectedItem"`
	NumWallbreakersLeft int      `json:"numWallbreakersLeft"`
	NumSillyPadsLeft    int      `json:"numSillyPadsLeft"`

	FoundationIndex uint8 `json:"-"`
	WallIndex       uint8 `json:"-"`
	GardenIndex     uint8 `json:"-"`

	Ready            bool   `json:"ready"`
	SelectedRole     Role   `json:"role"`
	SelectedModel    Model  `json:"model"`
	TickSelectedRole uint64 `json:"-"`

	ActionPressed bool `json:"-"`
}

func (pl *PlayerState) Update(currentTick uint64) {
	if pl.Mode == Cooldown {
		if currentTick-pl.CooldownStartTick >= pl.CooldownDurTicks {
			pl.Mode = Walking
		}
	}
	if pl.Mode == Ghost {
		if currentTick-pl.CooldownStartTick >= pl.CooldownDurTicks {
			pl.Mode = Walking
		}
	}
}

func (pl *PlayerState) DecrementNumColorChanges(currentTick uint64) {
	pl.NumColorChangesLeft--
	if pl.NumColorChangesLeft <= 0 {
		pl.EnterCooldown(currentTick)
	}
}

func (pl *PlayerState) EnterCooldown(currentTick uint64) {
	pl.Mode = Cooldown
	pl.CooldownStartTick = currentTick
	pl.CooldownDurTicks = CooldownTicks
}

func (pl *PlayerState) GetTilePosWhileMoving(currentTick uint64) (x int, y int) {
	if !pl.Moving {
		return pl.X, pl.Y
	}

	if pl.MoveDurTicks == 0 || currentTick <= pl.MoveStartTick {
		return pl.X, pl.Y
	}

	elapsed := currentTick - pl.MoveStartTick
	if elapsed*2 < pl.MoveDurTicks {
		return pl.X, pl.Y
	}

	return pl.ToX, pl.ToY
}

func (pl *PlayerState) SetSpecialTilesBasedOnRole() {
	switch pl.SelectedRole {
	case RoleGoldBot:
		pl.FoundationIndex = 8
		pl.WallIndex = 9
		pl.GardenIndex = 10
	case RoleSilverBot:
		pl.FoundationIndex = 5
		pl.WallIndex = 6
		pl.GardenIndex = 7
	case RoleWhiteBot:
		pl.FoundationIndex = 11
		pl.WallIndex = 12
		pl.GardenIndex = 13
	case RoleBlackBot:
		pl.FoundationIndex = 14
		pl.WallIndex = 15
		pl.GardenIndex = 16
	}
}

func (pl *PlayerState) UpdateScore(d DestroyedTiles) {
	switch pl.SelectedRole {
	case RoleSilverBot:
		pl.Score -= d.Silver.Walls*PointsPerWall + d.Silver.Gardens*PointsPerGarden
	case RoleGoldBot:
		pl.Score -= d.Gold.Walls*PointsPerWall + d.Gold.Gardens*PointsPerGarden
	case RoleWhiteBot:
		pl.Score -= d.White.Walls*PointsPerWall + d.White.Gardens*PointsPerGarden
	case RoleBlackBot:
		pl.Score -= d.Black.Walls*PointsPerWall + d.Black.Gardens*PointsPerGarden
	}
}

func (pl *PlayerState) SetGhost(currentTick uint64) {
	pl.Mode = Ghost
	pl.NumColorChangesLeft = 0
	pl.NumWallsLeft = 0
	pl.CooldownStartTick = currentTick
	pl.CooldownDurTicks = GhostTicks
}

func (pl *PlayerState) ResetData() {
	pl.ActionPressed = false
	pl.Moving = false
	pl.Facing = Down
	pl.Mode = Walking
	pl.NumSillyPadsLeft = DEFAULT_SILLY_PADS
	pl.NumWallbreakersLeft = DEFAULT_WALLBREAKERS
	pl.Score = 0
	pl.SelectedItem = ItemSillyPad
}
