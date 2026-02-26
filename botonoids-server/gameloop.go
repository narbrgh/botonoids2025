package main

import (
	"botonoids-server/internal/rooms"
	"encoding/json"
	"log"
	"strconv"
	"time"
)

// ------------0-0-0-0-0-0--------->
// --------- DRAIN QUEUED COMMANDS -
// -----:)-:)-:)--------------------

func drainQueuedCmds(ch <-chan QueuedCmd, dst []QueuedCmd) []QueuedCmd {
	for {
		select {
		case qc := <-ch:
			dst = append(dst, qc)
		default:
			return dst
		}
	}
}

// --------------------------------
// Authoritative game loop (Tick) |
// --------------------------------

func broadcast(room *rooms.Room, msg []byte) {
	for _, cl := range room.Clients {
		_ = trySend(cl, msg)
	}
}

func broadcastPendingTileChanges(room *rooms.Room) {
	changes := room.Map.PendingChanges()
	if len(changes) == 0 {
		return
	}
	msg := TileChangeListMsg{Type: "tileChangeList", TileChangeList: changes}
	if b, err := json.Marshal(msg); err == nil {
		broadcast(room, b)
	}
	room.Map.ResetChangeMap()
}

func setPlayerGhostAndResetFoundations(room *rooms.Room, p *rooms.PlayerState) bool {
	if p.Mode == rooms.Ghost {
		return false
	}
	room.Map.ResetFoundationTiles(p.FoundationIndex)
	p.SetGhost(room.Tick)
	return true
}

func pruneDisconnectedPlayersInLobby(room *rooms.Room) bool {
	if room.Phase != rooms.PhaseLobby {
		return false
	}

	removedAny := false
	hostWasRemoved := false
	currentHostID := room.HostID

	for id, p := range room.Players {
		if p != nil && !p.Connected {
			delete(room.Players, id)
			delete(room.Clients, id)
			managedForgetPlayerRoom(id)
			removedAny = true
			if strconv.Itoa(id) == currentHostID {
				hostWasRemoved = true
			}
		}
	}

	if !removedAny {
		return false
	}

	if hostWasRemoved {
		room.HostID = ""
		for id := range room.Players {
			room.HostID = strconv.Itoa(id)
			break
		}
	}

	return true
}

func CheckForWallBuild(room *rooms.Room, p *rooms.PlayerState) bool {
	wasGardenBuilt := false
	if p.ActionPressed == true {
		result := room.Map.TryToBuildWall(p.X, p.Y, p.FoundationIndex, p.WallIndex, p.ID) //TODO use foundation index and wallindex
		//result := room.Map.TryToBuildWall(p.X, p.Y, 5, 6, p.ID)

		if result == true { //wall was built

			//Decrement numWallsLeft
			p.NumWallsLeft = p.NumWallsLeft - 1

			//Increase score by points-per-wall
			p.Score += rooms.PointsPerWall

			// check for "garden" completion
			// TODO add foundation index, wallindex, and garden index
			gardenResult, numFoundationsDestroyed, numGardensBuilt := room.Map.CheckForGarden(p.X, p.Y, p.FoundationIndex, p.WallIndex, p.GardenIndex, p.ID)
			if gardenResult == true {
				//numFoundationsDestroyed++
				p.NumWallsLeft -= numFoundationsDestroyed
				p.Score += numGardensBuilt * rooms.PointsPerGarden
				wasGardenBuilt = true
			}

			if p.NumWallsLeft <= 0 {

				//the wallbuilding is done, so first reset the foundation tiles into wall tiles.

				//TODO reset foundation tiles
				room.Map.ResetFoundationTiles(p.FoundationIndex)

				// Now account for the special case: if there are still some tileChangesLeft, enter color changing mode.
				// else, enter cooldown

				if p.NumColorChangesLeft > 0 {
					p.Mode = rooms.ColorChanging
				} else {
					p.EnterCooldown(room.Tick)
				}
			}

			//now send a message (this will broadcast the walls built, and the change from foundation tiles to regular colors)
			broadcastPendingTileChanges(room)

		}
	}
	return wasGardenBuilt
}

func runGameLoop(
	room *rooms.Room,
	regCh <-chan Register,
	unregCh <-chan Unregister,
	cmdCh <-chan QueuedCmd,
	stopCh <-chan struct{},
) {
	tickDur := time.Second / time.Duration(rooms.TickHz)
	ticker := time.NewTicker(tickDur)
	defer ticker.Stop()

	pending := make([]QueuedCmd, 0, 256) // local, per-tick scratch buffer. pending queues. use this rather than making new one each tick, so that we don't keep allocating and unallocating memory.
	prevPlayerWireState := map[int]PlayerSnapshotLite{}

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
		}

		// 1) process register / unregister events (non-blocking)
	REGDRAIN: //this REGDRAIN label allows the break later to break out of the for (rather than just the select)
		for {
			select {
			case r := <-regCh:
				room.Clients[r.Client.PlayerID] = r.Client
				p, ok := room.Players[r.Client.PlayerID]
				if !ok {
					p = &rooms.PlayerState{ID: r.Client.PlayerID}
					room.Players[r.Client.PlayerID] = p
				}
				p.Connected = true
				if p.Name == "" {
					p.Name = getPlayerName(r.Client.PlayerID)
				}

				spawnX := 1
				spawnY := 1
				switch r.Client.PlayerID {
				case 1:
					spawnX = rooms.SpawnBaseX
					spawnY = rooms.SpawnBaseY
				case 2:
					spawnX = rooms.WorldCols - rooms.SpawnBaseX
					spawnY = rooms.WorldRows - rooms.SpawnBaseY
				case 3:
					spawnX = rooms.SpawnBaseX
					spawnY = rooms.WorldRows - rooms.SpawnBaseY
				case 4:
					spawnX = rooms.WorldCols - rooms.SpawnBaseX
					spawnY = rooms.SpawnBaseY
				}

				if p.Facing == "" {
					p.Facing = rooms.Down
				}
				if p.Mode == "" {
					p.Mode = rooms.Walking
				}
				if p.SelectedItem == "" {
					p.SelectedItem = rooms.ItemSillyPad
				}
				if p.SelectedRole == "" {
					p.SelectedRole = rooms.RoleObserver
				}
				if p.SelectedModel == "" {
					p.SelectedModel = rooms.ModelAlphanoid
				}
				if p.MoveDurTicks == 0 {
					p.MoveDurTicks = rooms.MoveTicks
				}
				if p.NumWallbreakersLeft == 0 {
					p.NumWallbreakersLeft = rooms.DEFAULT_WALLBREAKERS
				}
				if p.NumSillyPadsLeft == 0 {
					p.NumSillyPadsLeft = rooms.DEFAULT_SILLY_PADS
				}
				if p.X == 0 && p.Y == 0 && p.FromX == 0 && p.FromY == 0 && p.ToX == 0 && p.ToY == 0 {
					p.X = spawnX
					p.Y = spawnY
					p.FromX, p.FromY = spawnX, spawnY
					p.ToX, p.ToY = spawnX, spawnY
				}
				p.FoundationIndex = 5
				p.WallIndex = 6
				p.GardenIndex = 7

				// Send an immediate authoritative state to newly registered client.
				// This avoids join-time UI stale states (e.g., ready indicators).
				if b, err := encodePlayerMetaSnapshot(room); err == nil {
					_ = trySend(r.Client, b)
				}
				if b, err := encodePlayerStatusSnapshot(room); err == nil {
					_ = trySend(r.Client, b)
				}
				if b, err := encodePlayerSnapshot(room); err == nil {
					_ = trySend(r.Client, b)
				}
				if b, err := encodeTileMapSnapshotMsg(room); err == nil {
					_ = trySend(r.Client, b)
				}
				// Existing clients need metadata for newly connected players as well.
				if b, err := encodePlayerMetaSnapshot(room); err == nil {
					broadcast(room, b)
				}
				if b, err := encodePlayerStatusSnapshot(room); err == nil {
					broadcast(room, b)
				}
				// Force full player state delta on next tick for everyone.
				prevPlayerWireState = map[int]PlayerSnapshotLite{}
			case u := <-unregCh:
				if cl, ok := room.Clients[u.PlayerID]; ok {
					// Do not close Send here. A connected client can leave one room and join another.
					// The channel is closed by wsHandler when the websocket actually disconnects.
					_ = cl
					delete(room.Clients, u.PlayerID)
				}
				if p, ok := room.Players[u.PlayerID]; ok {
					if room.Phase == rooms.PhaseLobby {
						// In lobby, treat disconnect like a leave so stale offline slots do not persist.
						if p.SelectedRole == rooms.RoleGoldBot || p.SelectedRole == rooms.RolePinkBot || p.SelectedRole == rooms.RoleWhiteBot || p.SelectedRole == rooms.RoleBlackBot {
							roleStillTaken := false
							for id, other := range room.Players {
								if id == u.PlayerID {
									continue
								}
								if other.SelectedRole == p.SelectedRole {
									roleStillTaken = true
									break
								}
							}
							room.RoleTaken[p.SelectedRole] = roleStillTaken
						}
						delete(room.Players, u.PlayerID)
						managedForgetPlayerRoom(u.PlayerID)

						if room.HostID == strconv.Itoa(u.PlayerID) {
							room.HostID = ""
							for id := range room.Players {
								room.HostID = strconv.Itoa(id)
								break
							}
						}

						// Force fresh snapshots because player deltas do not encode removals.
						if b, err := encodePlayerMetaSnapshot(room); err == nil {
							broadcast(room, b)
						}
						if b, err := encodePlayerStatusSnapshot(room); err == nil {
							broadcast(room, b)
						}
						if b, err := encodePlayerSnapshot(room); err == nil {
							broadcast(room, b)
						}
						prevPlayerWireState = map[int]PlayerSnapshotLite{}
					} else {
						p.Connected = false
						p.Ready = false
					}
				}
				if managedCloseRoomIfAllDisconnected(room.ID) {
					stopRoomRunner(room.ID)
					return
				}
			default:
				break REGDRAIN
			}
		}

		// 2) drain commands
		pending = pending[:0]
		pending = drainQueuedCmds(cmdCh, pending)

		// 3) apply commands (authoritative)
		for _, qc := range pending {
			applyQueuedCmdToRoom(room, qc)
		}

		wasGardenBuilt := false
		// 4) advance any in-progress moves
		for _, p := range room.Players {
			if !p.Moving {
				if p.Mode == rooms.WallBuilding && !wasGardenBuilt {
					wasGardenBuilt = CheckForWallBuild(room, p)
				}

				continue
			}
			if room.Tick-p.MoveStartTick >= p.MoveDurTicks { // Tile move just finished! Time to check a bunch of stuff
				//commit at end of move
				p.X = p.ToX
				p.Y = p.ToY
				p.Moving = false
				//keep From/To aligned
				p.FromX, p.FromY = p.X, p.Y
				p.ToX, p.ToY = p.X, p.Y

				if p.Mode == rooms.ColorChanging {
					r := rooms.CheckColorChangeResult(p.X, p.Y, room.Map)
					switch r {
					case rooms.ColorChangeUnsuccessfulDoNotDecrement:
						//do nothing
					case rooms.ColorChangeUnsuccessfulStillDecrement:
						p.DecrementNumColorChanges(room.Tick)
					case rooms.ColorChangeSuccessful:

						// check for combo,
						// if not combo, then decrement numColorChanges while checking for changing to cooldown.
						//       NOTE: special case. if it is a combo, subtract 1 from numColorChanges, but don't go to cooldown yet. This way if you get a combo on your last colorChange, you still have to do cooldown after done building walls
						// then set i to be what color it changes to;
						// then tell the server TileMap about the initiateChange;
						// then broadcast msg to Client about the InitiateChange

						i, ok := room.Map.GetTileIndexAfterColorChange(p.X, p.Y)

						if ok {
							comboLength := rooms.TileMapInitiateColorChange(room.Map, p.X, p.Y, i, room.Tick, rooms.ColorChangeTicks, p.ID) // sends signal to the tilemap to start a color change. The tilemap will first check for a combo

							if comboLength >= rooms.MinimumCombo {

								// Add items for player (4 silly pads for combo length 8, 9; wallbreaker for combo length 10, 11; 4 silly pads and 2 wallbreakers for combo length 12+)
								if comboLength >= 8 && comboLength <= 9 {
									p.NumSillyPadsLeft += 4
								} else if comboLength >= 10 && comboLength <= 11 {
									p.NumWallbreakersLeft += 1
								} else if comboLength >= 12 {
									p.NumSillyPadsLeft += 4
									p.NumWallbreakersLeft += 2
								}

								//NOTE: special case. if it is a combo, subtract 1 from numColorChanges, but don't go to cooldown yet. This way if you get a combo on your last colorChange, you still have to do cooldown after done building walls
								p.NumColorChangesLeft = p.NumColorChangesLeft - 1

								//InitiateCombo makes the tilemap into foundations

								room.Map.InitiateCombo(p.FoundationIndex)
								//room.Map.InitiateCombo(5)

								// change mode to wallbuilding
								p.Mode = rooms.WallBuilding
								p.NumWallsLeft = comboLength - 3 // you can build 3 less walls than what your combo was

								//now send a message
								broadcastPendingTileChanges(room)

								// Now need to change the botonoid mode to WallBuilding

							} else { //not a combo, continue with the tile change
								p.DecrementNumColorChanges(room.Tick)
								msg := TileInitiateChangeMsg{Type: "tileInitiateChange", X: p.X, Y: p.Y, ToIndex: i, TileChangeStartTick: room.Tick, TileChangeDurTicks: rooms.ColorChangeTicks}

								if b, err := json.Marshal(msg); err == nil {
									broadcast(room, b)
								}
							}
						}
					default:
						//do nothing
					} //end switch r

				} else if p.Mode == rooms.WallBuilding {
					CheckForWallBuild(room, p)
				} // end else if p.Mode == WallBuilding
			}
		}

		// if a garden was built, there is a chance that it eliminated a player's foundations. In this case,
		// they still have "numwallsLeft" and "numcolorchangesleft"
		// time to reset numwallsleft to 0
		if wasGardenBuilt {
			for _, p := range room.Players {
				if p.NumWallsLeft > 0 {
					if room.Map.CountTilesOfIndex(p.FoundationIndex) == 0 {
						p.NumWallsLeft = 0

						// Now account for the special case: if there are still some colorChangesLeft, enter color changing mode.
						// else, enter cooldown

						if p.NumColorChangesLeft > 0 {
							p.Mode = rooms.ColorChanging
						} else {
							p.EnterCooldown(room.Tick)
						}

					} //end if room.Map.CountTilesOfIndex
				} // end if p.NumWallsLeft > 0
			} // next _, p
		} //end if was gardenbuilt

		// 5) use intentDir to start moves
		for _, p := range room.Players {
			// log only when relevant
			if !p.Moving && p.IntentDir != nil {
				log.Printf("[intent] tick=%d player=%d intent=%s", room.Tick, p.ID, *p.IntentDir)
			}

			if p.Moving {
				continue
			}
			if p.IntentDir == nil {
				continue
			}
			dir := *p.IntentDir

			if !p.Moving { // turning happebns immediately, even if blocked
				p.Facing = dir
			}

			// attempt to start move in p.IntentDir
			nx, ny := p.X, p.Y
			switch dir {
			case rooms.Up:
				ny--
			case rooms.Down:
				ny++
			case rooms.Left:
				nx--
			case rooms.Right:
				nx++
			}

			// bounds/collision check here; if blocked, do not start move
			if !room.Map.CheckMovement(nx, ny, p.ID, p.WallIndex, p.Mode == rooms.Ghost) {
				continue
			}

			p.Moving = true
			p.FromX, p.FromY = p.X, p.Y
			p.ToX, p.ToY = nx, ny
			p.MoveStartTick = room.Tick
			p.MoveDurTicks = rooms.MoveTicks
		}

		// 6) Updaters. (tile, player, etc)
		prevPhase := room.Phase
		room.UpdatePhase()
		prunedDisconnectedInLobby := pruneDisconnectedPlayersInLobby(room)
		managedSyncStatusFromPhase(room.ID, room.Phase)
		phaseChanged := room.Phase != prevPhase

		if phaseChanged {
			// Send a full map immediately on phase switches (especially lobby -> countdown)
			// so clients render the newly rerolled tilemap without waiting for periodic sync.
			if b, err := encodeTileMapSnapshotMsg(room); err == nil {
				broadcast(room, b)
			}
		}
		if prunedDisconnectedInLobby {
			if b, err := encodePlayerMetaSnapshot(room); err == nil {
				broadcast(room, b)
			}
			if b, err := encodePlayerStatusSnapshot(room); err == nil {
				broadcast(room, b)
			}
			if b, err := encodePlayerSnapshot(room); err == nil {
				broadcast(room, b)
			}
			prevPlayerWireState = map[int]PlayerSnapshotLite{}
		}
		sillyPadRemoved, expiredSillyPads, tileChanged, destroyedTiles, Explosions := room.Map.Update(room.Tick)

		if sillyPadRemoved {
			for _, p := range expiredSillyPads {
				//now send a message
				msg := SillyPadMsg{Type: "sillyPadMsg", Action: rooms.ItemRemove, X: p.X, Y: p.Y}
				if b, err := json.Marshal(msg); err == nil {
					broadcast(room, b)
				}
			}
		}

		if tileChanged {
			// send a message (this will broadcast the wall destroyed
			broadcastPendingTileChanges(room)
			tileChanged = false
		}

		for _, p := range room.Players {
			p.UpdateScore(destroyedTiles)
		}

		resetAnyFoundationsFromGhost := false
		for _, p := range Explosions {
			for _, q := range room.Players {
				dist := absInt(p.X-q.X) + absInt(p.Y-q.Y)
				if dist <= rooms.ExplosionRadius {
					if setPlayerGhostAndResetFoundations(room, q) {
						resetAnyFoundationsFromGhost = true
					}
				}
			}
		}
		if resetAnyFoundationsFromGhost {
			broadcastPendingTileChanges(room)
		}

		for _, p := range room.Players {
			p.Update(room.Tick)
		}

		// 7) broadcast snapshots

		// Send full player snapshot once per second, and per-tick deltas in between.
		if room.Tick%uint64(rooms.TickHz) == 0 {
			if b, err := encodePlayerSnapshot(room); err == nil {
				broadcast(room, b)
			}
		}
		if b, next, err := encodePlayerDelta(room, prevPlayerWireState); err == nil {
			prevPlayerWireState = next
			broadcast(room, b)
		}

		// Ready/results data is lobby/results-only; send on a slower wire.
		if room.Phase != rooms.PhasePlaying && room.Tick%4 == 0 {
			if b, err := encodePlayerStatusSnapshot(room); err == nil {
				broadcast(room, b)
			}
		}

		// Full tilemap snapshots are sent on join/phase-change only.
		// During gameplay, clients receive tile deltas (tileChange/tileChangeList).

		room.Tick++
	}
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
