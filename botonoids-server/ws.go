package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"

	"github.com/gorilla/websocket"
)

// ─────────────────────────────
// WebSocket upgrader
// ─────────────────────────────
var upgrader = websocket.Upgrader{ // This function controls whether cross-origin WebSocket requests are allowed
	CheckOrigin: func(r *http.Request) bool { return true }, // returning true means "accept all origins." OK for now (dev), but later will lock down for production
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
