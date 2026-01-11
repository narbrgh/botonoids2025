package main

import (
	"log"
	"time"
)

// cmdCh is the shared queue that all wsHandler goroutines push into.
// The buffer (1024) prevents small bursts from immediately blocking reads.
var cmdCh = make(chan QueuedCmd, 1024)

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

var regCh = make(chan Register, 32)
var unregCh = make(chan Unregister, 32)

// --------------------------------
// Authoritative game loop (Tick) |
// --------------------------------

func runGameLoop(room *Room) {
	tickDur := time.Second / time.Duration(TickHz)
	ticker := time.NewTicker(tickDur)
	defer ticker.Stop()

	pending := make([]QueuedCmd, 0, 256) // local, per-tick scratch buffer. pending queues. use this rather than making new one each tick, so that we don't keep allocating and unallocating memory.

	for range ticker.C {

		// 1) process register / unregister events (non-blocking)
	REGDRAIN: //this REGDRAIN label allows the break later to break out of the for (rather than just the select)
		for {
			select {
			case r := <-regCh:
				room.Clients[r.Client.PlayerID] = r.Client
				//create player state if missing
				if _, ok := room.Players[r.Client.PlayerID]; !ok {

					spawnX := 1
					spawnY := 1

					switch r.Client.PlayerID { // spawn based on playerID
					case 1:
						spawnX = SpawnBaseX
						spawnY = SpawnBaseY
					case 2:
						spawnX = WorldCols - SpawnBaseX
						spawnY = WorldRows - SpawnBaseY
					case 3:
						spawnX = SpawnBaseX
						spawnY = WorldRows - SpawnBaseY
					case 4:
						spawnX = WorldCols - SpawnBaseX
						spawnY = SpawnBaseY
					}

					room.Players[r.Client.PlayerID] = &PlayerState{
						ID:     r.Client.PlayerID,
						X:      spawnX,
						Y:      spawnY,
						Facing: Down,
						Moving: false,
						FromX:  spawnX, FromY: spawnY, ToX: spawnX, ToY: spawnY,
						MoveStartTick:       room.Tick,
						MoveDurTicks:        MoveTicks,
						Mode:                Walking,
						NumColorChangesLeft: 0,
						NumWallsLeft:        0,
					}
				}
			case u := <-unregCh:
				if cl, ok := room.Clients[u.PlayerID]; ok {
					close(cl.Send) // stop write goroutine
					delete(room.Clients, u.PlayerID)
				}
				delete(room.Players, u.PlayerID)
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

		// 4) advance any in-progress moves
		for _, p := range room.Players {
			if !p.Moving {
				continue
			}
			if room.Tick-p.MoveStartTick >= p.MoveDurTicks {
				//commit at end of move
				p.X = p.ToX
				p.Y = p.ToY
				p.Moving = false
				//keep From/To aligned
				p.FromX, p.FromY = p.X, p.Y
				p.ToX, p.ToY = p.X, p.Y

				if p.Mode == ColorChanging {
					//need authoritative tileGrid in server before I can implement this
					//note: colorchanging should take time (a fe seconds; should be tweakable), and the transition should be visually obvious and smooth
				}
			}
		}

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
			case Up:
				ny--
			case Down:
				ny++
			case Left:
				nx--
			case Right:
				nx++
			}

			// bounds/collision check here; if blocked, do not start move
			if nx < 0 || nx >= WorldCols || ny < 0 || ny >= WorldRows {
				continue
			}

			p.Moving = true
			p.FromX, p.FromY = p.X, p.Y
			p.ToX, p.ToY = nx, ny
			p.MoveStartTick = room.Tick
			p.MoveDurTicks = MoveTicks
		}

		// 6) broadcase snapshot
		b, err := encodeSnapshot(room)
		if err == nil {
			for _, cl := range room.Clients {
				//non-blocking send (drop if client is slow)
				select {
				case cl.Send <- b:
				default:
					//client is lagging; drop snapshot
				}
			}
		}

		room.Tick++
	}
}
