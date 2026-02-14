package main

import (
	// Provides JSON encoding/decoding utilities. Here it is needed specifically for json.RawMessage, which lets us defer decoding part of a JSON message.
	"botonoids-server/internal/rooms"
	"log"      // Provides logging utilities (log.Println, log.Printf, log.Fatal).
	"net/http" // Provides HTTP server functionality.
	// Provides low-level atomic operations. We use this to safely generate unique player IDs  across concurrent connections.
	// Third-party WebSocket library. This handles the WebSocket protocol on top of HTTP.
)

// ─────────────────────────────
// Program entry point
// ─────────────────────────────
func main() {

	room := rooms.NewRoom("default")

	go runGameLoop(room)

	http.HandleFunc("/ws", wsHandler) // Registers the wsHandler function to handle HTTP requests to the "/ws" path.

	log.Println("server listening on http://localhost:8080") // Log that the server is starting.

	log.Fatal(http.ListenAndServe(":8080", nil)) //Starts the HTTP server on port 8080. This call blocks forever. If the server fails to start, log.Fatal prints the error and exits the program

}
