package main

import "encoding/json"

func isValidDir(d DirType) bool {
	switch d {
	case Up, Down, Left, Right:
		return true
	default:
		return false
	}
}

type PlayerState struct { // this is the struct that gets sent through the protocol over the wire
	ID        int      `json:"id"`
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

	// variables for logic on changing colors, building walls, etc
	Mode                ModeType `json:"mode"`
	NumColorChangesLeft int      `json:"numColorChangesLeft"`
	NumWallsLeft        int      `json:"numWallsLeft"`
	CooldownStartTick   uint64   `json:"cooldownStartTick"`
	CooldownDurTicks    uint64   `json:"cooldownDurTicks"`

	// variables for logic on items and score
	Score               int      `json:"score"`
	SelectedItem        ItemType `json:"selectedItem"`
	NumWallbreakersLeft int      `json:"numWallbreakersLeft"`
	NumSillyPadsLeft    int      `json:"numSillyPadsLeft"`

	// tile indices for foundation, wall, and garden for each Role
	FoundationIndex uint8 `json:"-"`
	WallIndex       uint8 `json:"-"`
	GardenIndex     uint8 `json:"-"`

	// variables for Phase and game flow
	Ready            bool   `json:"ready"`
	SelectedRole     Role   `json:"role"`
	SelectedModel    Model  `json:"model"`
	TickSelectedRole uint64 `json:"-"`

	//server-side bool to keep track of if the action button is UP or DOWN
	ActionPressed bool `json:"-"`
}

// -------------------------------------
// APPLY QUEUED CMD TO STATE -----------
// ------ actually mutates player's state -----
// ----------- AUTHORITATIVE SERVER ------
//---------------------------------------

func applyQueuedCmdToRoom(room *Room, qc QueuedCmd) {

	p, ok := room.Players[qc.PlayerID]
	if !ok {
		return
	}

	typ, err := peekCmdType(qc.Cmd)
	if err != nil {
		return
	}

	if room.Phase != PhasePlaying {
		//only process non-playing commands
		if typ == "ready" {
			cmd, err := decodeReadyCmd(qc.Cmd)
			if err != nil {
				return
			}

			//first make sure the selected role is available
			if room.RoleTaken[cmd.Role] && cmd.Role != RoleObserver && cmd.Role != RoleRandomBot {

				if cl, ok := room.Clients[qc.PlayerID]; ok {
					sendJSON(cl, ServerMsg{Type: "roleInvalid", Msg: "role taken"})
				}
				return
			}
			room.RoleTaken[cmd.Role] = true
			p.Ready = true
			p.SelectedRole = cmd.Role
			p.SelectedModel = cmd.Model
			p.TickSelectedRole = room.Tick // keep track of WHEN the player selected their role, because if they weren't first, they don't get it!
		}
		return
	}

	switch typ {
	case "facing":
		cmd, err := decodeFacingCmd(qc.Cmd)
		if err != nil {
			return
		}
		p.Facing = cmd.Dir // or just cmd.Dir if string

	case "move": // NOTE! This code is no longer "called."
		cmd, err := decodeMoveCmd(qc.Cmd)
		if err != nil || !isValidDir(cmd.Dir) {
			return
		}

		//alraedy moving? ignore new move commands for now
		if p.Moving {
			return
		}

		// set facing regardless
		p.Facing = cmd.Dir

		nx, ny := p.X, p.Y
		switch cmd.Dir {
		case Up:
			ny--
		case Down:
			ny++
		case Left:
			nx--
		case Right:
			nx++
		}

		//bounds (temporary) TODO update this code, including "collision"
		if !room.Map.CheckMovement(nx, ny, p.ID, p.WallIndex) {
			return
		}

		// start movement
		p.Moving = true
		p.FromX, p.FromY = p.X, p.Y
		p.ToX, p.ToY = nx, ny
		p.MoveStartTick = room.Tick
		p.MoveDurTicks = MoveTicks

	// NOTE: This "case action" is no longer called. case action was for the original edge-triggered case
	// where it was actually PRESSED.
	//
	// If you want to re-enable this, go to Botonoids.ts, uncomment the first line of applyCommand
	// (control+F "ERIKISCOOL" to find the line).
	//
	// Then go to KeyboardController.ts, under ConsumeCommands, and add:
	//     if (this.anyPressed(this.keyMap.action)) cmds.push({type: 'action' });
	case "action":
		switch p.Mode {
		case Walking:
			p.Mode = ColorChanging
			p.NumColorChangesLeft = MaxNumColorChanges
		case WallBuilding:
			p.ActionPressed = true
		}

	case "actionDown":
		switch p.Mode {
		case Walking:
			p.Mode = ColorChanging
			p.NumColorChangesLeft = MaxNumColorChanges
		case WallBuilding:
			p.ActionPressed = true
		}

	case "actionUp":
		//only meaningful for wallBuilding
		p.ActionPressed = false

	case "changeItem":
		switch p.SelectedItem {
		case ItemSillyPad:
			p.SelectedItem = ItemWallbreaker

		case ItemWallbreaker:
			p.SelectedItem = ItemGhost

		case ItemGhost:
			p.SelectedItem = ItemSillyPad
		}
	case "useItem":
		switch p.SelectedItem {
		case ItemSillyPad:
			if p.NumSillyPadsLeft > 0 {
				if room.Map.CreateSillyPad(p.X, p.Y, p.ID, room.Tick, SillyPadTicks) {
					//silly pad created
					p.NumSillyPadsLeft--

					//now send a message
					msg := SillyPadMsg{Type: "sillyPadMsg", Action: "create", X: p.X, Y: p.Y, OwnerId: p.ID, ExpiresAtTick: room.Tick + SillyPadTicks}
					if b, err := json.Marshal(msg); err == nil {
						broadcast(room, b)
					}
				}
			}
		}

	case "input":
		cmd, err := decodeInputCmd(qc.Cmd)
		if err != nil {
			return
		}

		// allow "" to mean "no movement"
		if cmd.Dir == nil {
			p.IntentDir = nil
			return
		}

		//validate
		d := *cmd.Dir
		if !isValidDir(d) {
			return
		}

		//store intent
		p.IntentDir = cmd.Dir

		// also update facing immediately if you want:
		if !p.Moving {
			p.Facing = *cmd.Dir
		}
	}
}

func (pl *PlayerState) Update(currentTick uint64) {
	if pl.Mode == Cooldown {
		if currentTick-pl.CooldownStartTick >= pl.CooldownDurTicks {
			pl.Mode = Walking
		}
	}
}

func (pl *PlayerState) DecrementNumColorChanges(currentTick uint64) {
	pl.NumColorChangesLeft = pl.NumColorChangesLeft - 1
	if pl.NumColorChangesLeft <= 0 {
		pl.EnterCooldown(currentTick)
	}
}

func (pl *PlayerState) EnterCooldown(currentTick uint64) {
	pl.Mode = Cooldown
	pl.CooldownStartTick = currentTick
	pl.CooldownDurTicks = CooldownTicks
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
