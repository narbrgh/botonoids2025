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

	case "action":
		// for now, do nothing on server. TODO finish adding action
		switch p.Mode {
		case Walking:
			p.Mode = ColorChanging
			p.NumColorChangesLeft = 5 //TODO make it not hardcoded
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
