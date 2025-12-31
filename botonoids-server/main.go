package main // Declares this file as part of the "main" package. In Go, the package named "main" is special: it produces an executable program (not a library).

import (
	"encoding/json" // Provides JSON encoding/decoding utilities. Here it is needed specifically for json.RawMessage, which lets us defer decoding part of a JSON message.
	"log"           // Provides logging utilities (log.Println, log.Printf, log.Fatal).
	"net/http"      // Provides HTTP server functionality.
	"sync/atomic"   // Provides low-level atomic operations. We use this to safely generate unique player IDs  across concurrent connections.
	"time"

	"github.com/gorilla/websocket" // Third-party WebSocket library. This handles the WebSocket protocol on top of HTTP.
)

// ─────────────────────────────
// Server → Client message shape
// ─────────────────────────────
type ServerMsg struct {
	Type     string `json:"type"`               // Discriminator field that tells the client  what kind of message this is ("hello", "ack", etc.)
	PlayerID int    `json:"playerId,omitempty"` // Player ID assigned by the server. `omitempty` means this field is omitted from JSON if it has the zero value (0).
	Msg      string `json:"msg,omitempty"`      // Optional human-readable message.
}

// ─────────────────────────────
// Client → Server message shape
// ─────────────────────────────
type ClientMsg struct {
	Type string          `json:"type"`          // Discriminator field ("command", etc.)
	Cmd  json.RawMessage `json:"cmd,omitempty"` // Raw JSON payload for the command. We keep this as RawMessage so we can decode it later once we know what type it is.
	Seq  int             `json:"seq,omitempty"` // Sequence number sent by the client. This can later be used for acknowledgments, ordering, or prediction reconciliation.
}

// ─────────────────────────────
// Command queue (Client → Tick loop)
// ─────────────────────────────

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

type MoveCmd struct {
	Type string `json:"type"` // "move"
	Dir  string `json:="dir"` // "up" | "down" | "left" | "right"
}

type FacingCmd struct {
	Type string `json:"type"` // "facing"
	Dir  string `json:="dir"` // "up" | "down" | "left" | "right"
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

// cmdCh is the shared queue that all wsHandler goroutines push into.
// The buffer (1024) prevents small bursts from immediately blocking reads.
var cmdCh = make(chan QueuedCmd, 1024)

// --------------------------------
// Authoritative game loop (Tick) |
// --------------------------------

type GameState struct {
	Tick uint64
}

func runGameLoop(state *GameState) {
	const tickHz = 20
	tickDur := time.Second / tickHz

	ticker := time.NewTicker(tickDur)
	defer ticker.Stop()

	//Reuse a slice each tick to avoid allocating constantly
	pending := make([]QueuedCmd, 0, 256)

	for range ticker.C {
		// Drain everything currently queued (non-blocking)
		pending = pending[:0]

	DRAIN:
		for {
			select {
			case qc := <-cmdCh:
				pending = append(pending, qc)
			default:
				break DRAIN //the DRAIN refers to the "for" loop. This break breaks out of that for
			}
		}

		for _, qc := range pending {
			// Peek at the "type" field
			var kind struct {
				Type string `json:"type"`
			}

			if err := json.Unmarshal(qc.Cmd, &kind); err != nil {
				log.Printf("bad cmd json from player %d: %v", qc.PlayerID, err)
				continue
			}

			switch kind.Type {
			case "move":
				var cmd MoveCmd
				if err := json.Unmarshal(qc.Cmd, &cmd); err != nil {
					log.Printf("bad move cmd: %v", err)
					continue
				}
				log.Printf("[tick=%d] MOVE player=%d dir=%s", state.Tick, qc.PlayerID, cmd.Dir)
			case "facing":
				var cmd FacingCmd
				if err := json.Unmarshal(qc.Cmd, &cmd); err != nil {
					log.Printf("bad face cmd: %v", err)
					continue
				}
				log.Printf("[tick=%d] FACE player=%d dir=%s", state.Tick, qc.PlayerID, cmd.Dir)
			case "action":
				log.Printf("[tick=%d] ACTION player=%d", state.Tick, qc.PlayerID)

			case "changeItem":
				log.Printf("[tick=%d] CHANGE_ITEM player=%d", state.Tick, qc.PlayerID)

			case "useItem":
				log.Printf("[tick=%d] USE_ITEM player=%d", state.Tick, qc.PlayerID)

			default:
				log.Printf("unknown cmd type %q", kind.Type)
			}

		}
		state.Tick++
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

	log.Printf("client connected, playerId=%d", playerID) // Log that a new client has connected.

	// ─────────────────────────────
	// Send initial "hello" message
	// ─────────────────────────────
	_ = c.WriteJSON(ServerMsg{ // Sends a JSON message to the client. This assigns the client its player ID. The `_ =` means we are intentionally ignoring the returned error for now.
		Type:     "hello",
		PlayerID: playerID,
		Msg:      "connected",
	})

	// ─────────────────────────────
	// Main receive loop
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

		_ = c.WriteJSON(ServerMsg{ // Send acknowledgement ("ack"). This confirms the receipt of the command, but does NOT mean that it was necessarily applied
			Type:     "ack",
			PlayerID: playerID,
			Msg:      "got it",
		})

	}
}

// ─────────────────────────────
// Program entry point
// ─────────────────────────────
func main() {
	state := &GameState{}
	go runGameLoop(state)

	http.HandleFunc("/ws", wsHandler) // Registers the wsHandler function to handle HTTP requests to the "/ws" path.

	log.Println("server listening on http://localhost:8080") // Log that the server is starting.

	log.Fatal(http.ListenAndServe(":8080", nil)) //Starts the HTTP server on port 8080. This call blocks forever. If the server fails to start, log.Fatal prints the error and exits the program

}
