package main

import (
	"botonoids-server/internal/rooms"
	"encoding/json"
)

// APPLY QUEUED CMD TO STATE
func applyQueuedCmdToRoom(room *rooms.Room, qc QueuedCmd) {
	p, ok := room.Players[qc.PlayerID]
	if !ok {
		return
	}

	typ, err := peekCmdType(qc.Cmd)
	if err != nil {
		return
	}

	if room.Phase != rooms.PhasePlaying {
		if typ == "ready" {
			cmd, err := decodeReadyCmd(qc.Cmd)
			if err != nil {
				return
			}

			if room.RoleTaken[cmd.Role] && cmd.Role != rooms.RoleObserver && cmd.Role != rooms.RoleRandomBot {
				if cl, ok := room.Clients[qc.PlayerID]; ok {
					sendJSON(cl, ServerMsg{Type: "roleInvalid", Msg: "role taken"})
				}
				return
			}
			room.RoleTaken[cmd.Role] = true
			p.Ready = true
			p.SelectedRole = cmd.Role
			p.SelectedModel = cmd.Model
			p.TickSelectedRole = room.Tick
			managedSetPlayerReady(qc.PlayerID, true)
		}
		return
	}

	switch typ {
	case "facing":
		cmd, err := decodeFacingCmd(qc.Cmd)
		if err != nil {
			return
		}
		p.Facing = cmd.Dir

	case "move":
		cmd, err := decodeMoveCmd(qc.Cmd)
		if err != nil || !rooms.IsValidDir(cmd.Dir) {
			return
		}
		if p.Moving {
			return
		}
		p.Facing = cmd.Dir

		nx, ny := p.X, p.Y
		switch cmd.Dir {
		case rooms.Up:
			ny--
		case rooms.Down:
			ny++
		case rooms.Left:
			nx--
		case rooms.Right:
			nx++
		}

		if !room.Map.CheckMovement(nx, ny, p.ID, p.WallIndex, p.Mode == rooms.Ghost) {
			return
		}

		p.Moving = true
		p.FromX, p.FromY = p.X, p.Y
		p.ToX, p.ToY = nx, ny
		p.MoveStartTick = room.Tick
		p.MoveDurTicks = rooms.MoveTicks

	case "action", "actionDown":
		switch p.Mode {
		case rooms.Walking:
			p.Mode = rooms.ColorChanging
			p.NumColorChangesLeft = rooms.MaxNumColorChanges
		case rooms.WallBuilding:
			p.ActionPressed = true
		}

	case "actionUp":
		p.ActionPressed = false

	case "changeItem":
		switch p.SelectedItem {
		case rooms.ItemSillyPad:
			p.SelectedItem = rooms.ItemWallbreaker
		case rooms.ItemWallbreaker:
			p.SelectedItem = rooms.ItemGhost
		case rooms.ItemGhost:
			p.SelectedItem = rooms.ItemSillyPad
		}

	case "useItem":
		if p.Mode == rooms.Ghost {
			break
		}

		switch p.SelectedItem {
		case rooms.ItemSillyPad:
			if p.NumSillyPadsLeft > 0 {
				sillyPadX := p.X
				sillyPadY := p.Y
				if p.Moving {
					sillyPadX, sillyPadY = p.GetTilePosWhileMoving(room.Tick)
				}
				if room.Map.CreateSillyPad(sillyPadX, sillyPadY, p.ID, room.Tick, rooms.SillyPadTicks) {
					p.NumSillyPadsLeft--
					msg := SillyPadMsg{Type: "sillyPadMsg", Action: rooms.ItemCreate, X: sillyPadX, Y: sillyPadY, OwnerId: p.ID, ExpiresAtTick: room.Tick + rooms.SillyPadTicks}
					if b, err := json.Marshal(msg); err == nil {
						broadcast(room, b)
					}
				}
			}
		case rooms.ItemWallbreaker:
			nx := p.X
			ny := p.Y

			if p.NumWallbreakersLeft > 0 && !p.Moving {
				switch p.Facing {
				case rooms.Up:
					ny--
				case rooms.Down:
					ny++
				case rooms.Left:
					nx--
				case rooms.Right:
					nx++
				}

				if room.Map.CreateWallbreaker(nx, ny, room.Tick, rooms.WallbreakerTicks) {
					p.NumWallbreakersLeft--
					msg := WallbreakerMsg{Type: "wallbreakerMsg", Action: rooms.ItemCreate, X: nx, Y: ny, StartTick: room.Tick, ExpiresAtTick: room.Tick + rooms.WallbreakerTicks}
					if b, err := json.Marshal(msg); err == nil {
						broadcast(room, b)
					}
				}
			}
		case rooms.ItemGhost:
			p.SetGhost(room.Tick)
		}

	case "input":
		cmd, err := decodeInputCmd(qc.Cmd)
		if err != nil {
			return
		}
		if cmd.Dir == nil {
			p.IntentDir = nil
			return
		}

		d := *cmd.Dir
		if !rooms.IsValidDir(d) {
			return
		}

		p.IntentDir = cmd.Dir
		if !p.Moving {
			p.Facing = *cmd.Dir
		}
	}
}
