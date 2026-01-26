package main

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

	switch typ {
	case "facing":
		cmd, err := decodeFacingCmd(qc.Cmd)
		if err != nil {
			return
		}
		p.Facing = cmd.Dir // or just cmd.Dir if string

	case "move":
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
		if nx < 0 || nx >= WorldCols || ny < 0 || ny >= WorldRows {
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
