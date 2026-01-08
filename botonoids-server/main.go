package main // Declares this file as part of the "main" package. In Go, the package named "main" is special: it produces an executable program (not a library).

import (
	"encoding/json" // Provides JSON encoding/decoding utilities. Here it is needed specifically for json.RawMessage, which lets us defer decoding part of a JSON message.
	"log"           // Provides logging utilities (log.Println, log.Printf, log.Fatal).
	"net/http"      // Provides HTTP server functionality.
	"sync/atomic"   // Provides low-level atomic operations. We use this to safely generate unique player IDs  across concurrent connections.
	"time"

	"github.com/gorilla/websocket" // Third-party WebSocket library. This handles the WebSocket protocol on top of HTTP.
)

// ---------00-0-0-0-0-0-0-0-0------
// --- CONSTANTS -------000--0--00--
// --00-0-0-0---------------00-0-0--

const (
	TickHz     = 20
	MoveTicks  = 10 // 500 ms at 20 Hz -> 10 ticks. If you change this here, change in Constants.ts (TODO: make this take in the Constants file movement speed)
	WorldCols  = 30 // temporary bounds for now (TODO update this later)
	WorldRows  = 16
	SpawnBaseX = 6
	SpawnBaseY = 6
	SpawnCols  = 12
	NewSeed    = 10 //TODO make random seed
)

// ─────────────────────────────
// Server → Client message shape
// ─────────────────────────────
type ServerMsg struct {
	Type     string `json:"type"`               // Discriminator field that tells the client  what kind of message this is ("hello", "ack", etc.)
	PlayerID int    `json:"playerId,omitempty"` // Player ID assigned by the server. `omitempty` means this field is omitted from JSON if it has the zero value (0).
	Msg      string `json:"msg,omitempty"`      // Optional human-readable message.
}

// -----------------------------------
// Server -> Client config message ---
// ----------0-0-00-0-------=-=-=-=---

type ConfigMsg struct {
	Type string `json:"type"`

	TickHz    int    `json:"tickHz"`
	MoveTicks uint64 `json:"moveTicks"`

	// gameplay knobs
	MoveDurMs           int `json:"moveDurMs"`
	ColorCooldownMs     int `json:"colorCooldownMs"`
	MaxTilesColorChange int `json:"maxTileColorChange"`
	TileSize            int `json:"tileSize"`

	// world map
	Seed uint32 `json:"seed,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`

	//version
	ConfigVersion int `json:"configVersion:"`
}

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

// ─────────────────────────────
// Client → Server message shape
// ─────────────────────────────
type ClientMsg struct {
	Type string          `json:"type"`          // Discriminator field ("command", etc.)
	Cmd  json.RawMessage `json:"cmd,omitempty"` // Raw JSON payload for the command. We keep this as RawMessage so we can decode it later once we know what type it is.
	Seq  int             `json:"seq,omitempty"` // Sequence number sent by the client. This can later be used for acknowledgments, ordering, or prediction reconciliation.
}

// ─────────────────────────────--------
// Command queue (Client → Tick loop)
// ─────────────────────────────--------

// QueuedCmd is one command received from a specific player.
// For now, Cmd stays as raw JSON (we'll decode it later in the tick loop).
type QueuedCmd struct {
	PlayerID int
	Seq      int
	Cmd      json.RawMessage
}

// ------------------------------------
// -- COMMAND STRUCTS -----------------
// ----------------``-`-`-`--`-`-`-`-`-

type DirType string

const (
	Up    DirType = "up"
	Down  DirType = "down"
	Left  DirType = "left"
	Right DirType = "right"
)

type ModeType string

const (
	Walking       ModeType = "walking"
	ColorChanging ModeType = "colorchanging"
	WallBuilding  ModeType = "wallbuilding"
	Ghost         ModeType = "ghost"
	Cooldown      ModeType = "cooldown"
)

func isValidDir(d DirType) bool {
	switch d {
	case Up, Down, Left, Right:
		return true
	default:
		return false
	}
}

type MoveCmd struct {
	Type string  `json:"type"` // "move"
	Dir  DirType `json:"dir"`  // "up" | "down" | "left" | "right"
}

func decodeMoveCmd(raw json.RawMessage) (MoveCmd, error) {
	var cmd MoveCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type FacingCmd struct {
	Type string  `json:"type"` // "facing"
	Dir  DirType `json:"dir"`  // "up" | "down" | "left" | "right"
}

func decodeFacingCmd(raw json.RawMessage) (FacingCmd, error) {
	var cmd FacingCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type ActionCmd struct {
	Type string `json:"type"` // "action"
}

type ChangeItemCmd struct {
	Type string `json:"type"` // "changeItem"
}

type UseItemCmd struct {
	Type string `json:"type"` // "useItem"
}

// ------------------------------
// ----- More STRUCTS -----------
// ------------*_*_*_*_*_*-_-_-_-

type Client struct {
	PlayerID int
	Conn     *websocket.Conn
	Send     chan []byte // outbound messages (already encoded JSON)
}

type Register struct {
	Client *Client
}

type Unregister struct {
	PlayerID int
}

var regCh = make(chan Register, 32)
var unregCh = make(chan Unregister, 32)

type PlayerState struct {
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
}

type InputCmd struct {
	Type string   `json:"type"` // "input"
	Dir  *DirType `json:"dir"`  // "up|down|left|right". nil = no input
}

func decodeInputCmd(raw json.RawMessage) (InputCmd, error) {
	var cmd InputCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

// ROOM structs etc. For lobby code
type Phase string

const (
	PhaseLobby     Phase = "lobby"
	PhaseCountdown Phase = "countdown"
	PhasePlaying   Phase = "playing"
	PhaseFinished  Phase = "finished"
)

type Room struct {
	ID    string
	Tick  uint64
	Phase Phase

	Seed uint32

	Clients map[int]*Client
	Players map[int]*PlayerState
}

type SnapshotMsg struct {
	Type    string         `json:"type"` // "snapshot"
	Tick    uint64         `json:"tick"`
	Phase   Phase          `json:"phase"`
	Players []*PlayerState `json:"players"`
}

// helper function to encode once
func encodeSnapshot(room *Room) ([]byte, error) {
	players := make([]*PlayerState, 0, len(room.Players))
	for _, p := range room.Players {
		players = append(players, p)
	}
	msg := SnapshotMsg{Type: "snapshot", Tick: room.Tick, Phase: room.Phase, Players: players}
	return json.Marshal(msg)
}

// helper function to send JSON
func sendJSON(cl *Client, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	// Non-blocking send (drop if client is slow)
	select {
	case cl.Send <- b:
	default: //TODO later can add code for errors/drops; for now keep it simple
	}
}

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

// ----------------------------  - -
// --------PEEK AT CMD TYPE ---   --
// ---------------------------------

type cmdKind struct {
	Type string `json:"type"`
}

func peekCmdType(raw json.RawMessage) (string, error) {
	var k cmdKind
	if err := json.Unmarshal(raw, &k); err != nil {
		return "", err
	}
	return k.Type, nil
}

// --------------------------------
// Authoritative game loop (Tick) |
// --------------------------------

func runGameLoop(room *Room) {
	const tickHz = 20
	tickDur := time.Second / tickHz
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

// ─────────────────────────────
// WebSocket upgrader
// ─────────────────────────────
var upgrader = websocket.Upgrader{ // This function controls whether cross-origin WebSocket requests are allowed
	CheckOrigin: func(r *http.Request) bool { return true }, // returning true means "accept all origins." OK for now (dev), but later will lock down for production
}

// ─────────────────────────────
// Player ID generator
// ─────────────────────────────
var nextID int32 = 0 // Global counter used to assign unique player IDs. We use atomic operations on this to stay safe when multiple clients connect concurrently.

// ─────────────────────────────
// WebSocket handler
// ─────────────────────────────
func wsHandler(w http.ResponseWriter, r *http.Request) { // This func is called whenever a client connects to the /ws HTTP endpoint
	c, err := upgrader.Upgrade(w, r, nil) // Converts ("upgrades") an HTTP connection into a Websocket connection. After this point, we are no longer doing HTTP
	if err != nil {
		log.Println("upgrade:", err) // If the upgrade fails, log the error and exit.
		return
	}

	defer c.Close() // Ensures the WebSocket connection is closed when this function returns.
	//NOTE: defer does not run until AFTER the function returns (Golang syntax)

	playerID := int(atomic.AddInt32(&nextID, 1)) // Atomically increment nextID and return the new value. This guarantees unique player IDs even if two clients connect at the same time.

	// unregister should be deferred once, here
	defer func() {
		unregCh <- Unregister{PlayerID: playerID}
	}()

	client := &Client{
		PlayerID: playerID,
		Conn:     c,
		Send:     make(chan []byte, 256),
	}

	// register client with the game loop
	regCh <- Register{Client: client}

	//  writer goroutine: send snapshots/msgs to the socket
	go func() {
		// If this goroutine exits, the connection should close.
		// (Often you let wsHandler's defer do the close; either is fine.)
		for msg := range client.Send {
			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// ─────────────────────────────
	// Send initial "hello" message
	// ─────────────────────────────

	/* changed this WriteJSON to sendJSON -- apparently if we have WriteJSONs in numerous gofuncs at once, we can get two at the same time, which can make issues
	_ = c.WriteJSON(ServerMsg{ // Sends a JSON message to the client. This assigns the client its player ID. The `_ =` means we are intentionally ignoring the returned error for now.
		Type:     "hello",
		PlayerID: playerID,
		Msg:      "connected",
	})*/

	sendJSON(client, ServerMsg{Type: "hello", PlayerID: playerID, Msg: "connected"})
	sendJSON(client, makeConfig())

	// ─────────────────────────────
	// Main receive loop: receive commands and enqueue them
	// ─────────────────────────────
	for {
		var m ClientMsg // Allocate a ClientMsg struct to hold the next message from the client.

		if err := c.ReadJSON(&m); err != nil { //Here, the if statement has two parts: in go, "if" can have a short statement, then a boolean condition.
			// err := c.readJSON(&m) if the short statement. Recall := is a short variable declaration. var empty string is the same as empty := "".
			// second part, err != nil, is the actual "boolean" evaluated part of the if statement

			// Blocks until a JSON message is received (the CPU doesn't cycle 100% with the infinite for loop because this line waits for a message)
			// or the connection is closed.

			log.Printf("read error playerId=%d: %v", playerID, err) // Most commonly this error means the client disconnected.

			return // Exit the handler, which closes the connection.
		}
		log.Printf("[ws] got msg from player=%d type=%s seq = %d cmd = %s", playerID, m.Type, m.Seq, string(m.Cmd))

		// Add the command to the "command queue" for the server to process once per "tick"
		cmdCh <- QueuedCmd{
			PlayerID: playerID,
			Seq:      m.Seq,
			Cmd:      m.Cmd,
		}

		/* changing all write JSON calls to the sendJSON function (Gorilla Websockets doesn't want WriteJSON from multiple gofuncs, because if both arrive at once, it can cause issues)
		_ = c.WriteJSON(ServerMsg{ // Send acknowledgement ("ack"). This confirms the receipt of the command, but does NOT mean that it was necessarily applied
			Type:     "ack",
			PlayerID: playerID,
			Msg:      "got it",
		})*/
		sendJSON(client, ServerMsg{Type: "ack", PlayerID: playerID, Msg: "got it"})

	}
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

// ─────────────────────────────
// Program entry point
// ─────────────────────────────
func main() {

	room := &Room{
		ID:      "default",
		Phase:   PhaseLobby,
		Seed:    uint32(time.Now().UnixNano()), // good enough for now //TODO make see better
		Clients: make(map[int]*Client),
		Players: make(map[int]*PlayerState),
	}

	go runGameLoop(room)

	http.HandleFunc("/ws", wsHandler) // Registers the wsHandler function to handle HTTP requests to the "/ws" path.

	log.Println("server listening on http://localhost:8080") // Log that the server is starting.

	log.Fatal(http.ListenAndServe(":8080", nil)) //Starts the HTTP server on port 8080. This call blocks forever. If the server fails to start, log.Fatal prints the error and exits the program

}
