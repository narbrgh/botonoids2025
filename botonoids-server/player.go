package main

import (
	"botonoids-server/internal/rooms"
	"encoding/json"
	"strings"
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

	switch typ {
	case "resyncRequest":
		if cl, ok := room.Clients[qc.PlayerID]; ok {
			if b, err := encodePlayerMetaSnapshot(room); err == nil {
				_ = trySend(cl, b)
			}
			if b, err := encodePlayerStatusSnapshot(room); err == nil {
				_ = trySend(cl, b)
			}
			if b, err := encodePlayerSnapshot(room); err == nil {
				_ = trySend(cl, b)
			}
			if b, err := encodeTileMapSnapshotMsg(room); err == nil {
				_ = trySend(cl, b)
			}
		}
		return
	case "name":
		cmd, err := decodeNameCmd(qc.Cmd)
		if err != nil {
			return
		}
		setPlayerName(qc.PlayerID, cmd.Name)
		p.Name = getPlayerName(qc.PlayerID)
		if b, err := encodePlayerMetaSnapshot(room); err == nil {
			broadcast(room, b)
		}
		return
	case "chat":
		cmd, err := decodeChatCmd(qc.Cmd)
		if err != nil {
			return
		}
		text := strings.TrimSpace(cmd.Text)
		if text == "" {
			return
		}
		if len(text) > 180 {
			text = text[:180]
		}
		msg := ChatMsg{
			Type:     "chat",
			PlayerID: qc.PlayerID,
			Name:     getPlayerName(qc.PlayerID),
			Text:     text,
		}
		if b, err := json.Marshal(msg); err == nil {
			broadcast(room, b)
		}
		return
	}

	isColorRole := func(role rooms.Role) bool {
		return role == rooms.RoleGoldBot || role == rooms.RolePinkBot || role == rooms.RoleWhiteBot || role == rooms.RoleBlackBot
	}
	releaseRole := func(ownerID int, role rooms.Role) {
		if isColorRole(role) {
			// Clear reservation only if no other player still owns this role.
			for pid, other := range room.Players {
				if pid == ownerID {
					continue
				}
				if other.SelectedRole == role {
					room.RoleTaken[role] = true
					return
				}
			}
			room.RoleTaken[role] = false
		}
	}
	tryClaimRole := func(claimantID int, role rooms.Role) bool {
		if !isColorRole(role) {
			return true
		}
		// Use actual ownership as source of truth; RoleTaken can drift.
		for pid, other := range room.Players {
			if pid == claimantID {
				continue
			}
			if other.SelectedRole == role {
				return false
			}
		}
		room.RoleTaken[role] = true
		return true
	}

	if room.Phase != rooms.PhasePlaying {
		if typ == "resultsOk" {
			if room.Phase == rooms.PhaseFinished {
				p.ResultsDismissed = true
				if b, err := encodePlayerStatusSnapshot(room); err == nil {
					broadcast(room, b)
				}
			}
			return
		}

		if typ == "cancelCountdown" {
			if room.Phase == rooms.PhaseCountdown {
				room.ForceResetToLobby()
				managedSyncStatusFromPhase(room.ID, room.Phase)
			}
			return
		}

		if typ == "roleSelect" {
			cmd, err := decodeRoleSelectCmd(qc.Cmd)
			if err != nil {
				return
			}

			roleChanged := p.SelectedRole != cmd.Role
			if roleChanged {
				releaseRole(qc.PlayerID, p.SelectedRole)
				if !tryClaimRole(qc.PlayerID, cmd.Role) {
					if cl, ok := room.Clients[qc.PlayerID]; ok {
						sendJSON(cl, ServerMsg{Type: "roleInvalid", Msg: "role taken"})
					}
					return
				}
			} else if isColorRole(cmd.Role) && !room.RoleTaken[cmd.Role] {
				// If player already selected this color earlier, don't reject their ready.
				// Reconcile reservation bit when it drifted.
				room.RoleTaken[cmd.Role] = true
			}

			p.SelectedRole = cmd.Role
			if roleChanged && p.Ready {
				p.Ready = false
				managedSetPlayerReady(qc.PlayerID, false)
			}
			if b, err := encodePlayerMetaSnapshot(room); err == nil {
				broadcast(room, b)
			}
			if b, err := encodePlayerStatusSnapshot(room); err == nil {
				broadcast(room, b)
			}
			return
		}

		if typ == "ready" {
			cmd, err := decodeReadyCmd(qc.Cmd)
			if err != nil {
				return
			}

			if !cmd.Ready {
				p.Ready = false
				releaseRole(qc.PlayerID, p.SelectedRole)
				p.SelectedRole = rooms.RoleObserver
				managedSetPlayerReady(qc.PlayerID, false)
				if b, err := encodePlayerMetaSnapshot(room); err == nil {
					broadcast(room, b)
				}
				if b, err := encodePlayerStatusSnapshot(room); err == nil {
					broadcast(room, b)
				}
				return
			}

			if p.SelectedRole != cmd.Role {
				releaseRole(qc.PlayerID, p.SelectedRole)
			}

			if !tryClaimRole(qc.PlayerID, cmd.Role) {
				if cl, ok := room.Clients[qc.PlayerID]; ok {
					sendJSON(cl, ServerMsg{Type: "roleInvalid", Msg: "role taken"})
				}
				return
			}

			p.Ready = true
			p.SelectedRole = cmd.Role
			p.SelectedModel = cmd.Model
			p.TickSelectedRole = room.Tick
			managedSetPlayerReady(qc.PlayerID, true)
			if b, err := encodePlayerMetaSnapshot(room); err == nil {
				broadcast(room, b)
			}
			if b, err := encodePlayerStatusSnapshot(room); err == nil {
				broadcast(room, b)
			}
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
