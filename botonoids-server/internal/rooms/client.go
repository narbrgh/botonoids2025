package rooms

import "github.com/gorilla/websocket"

type Client struct {
	PlayerID int
	Conn     *websocket.Conn
	Send     chan []byte
}
