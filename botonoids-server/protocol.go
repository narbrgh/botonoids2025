package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"

	"github.com/gorilla/websocket"
)

type DirType string
type ModeType string
type Phase string

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
	PhaseLobby     Phase = "lobby"
	PhaseCountdown Phase = "countdown"
	PhasePlaying   Phase = "playing"
	PhaseFinished  Phase = "finished"
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

type InputCmd struct {
	Type string   `json:"type"` // "input"
	Dir  *DirType `json:"dir"`  // "up|down|left|right". nil = no input
}

func decodeInputCmd(raw json.RawMessage) (InputCmd, error) {
	var cmd InputCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
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
