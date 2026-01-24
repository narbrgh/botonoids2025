package main

import (
	"encoding/json"
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
	ConfigVersion int `json:"configVersion"`
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

type TileChangeMsg struct {
	Type  string `json:"type"` // "tileChange"
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Index uint8  `json:"index"`
}

type TileInitiateChangeMsg struct {
	Type                string `json:"type"` // "tileInitiateChange"
	X                   int    `json:"x"`
	Y                   int    `json:"y"`
	ToIndex             uint8  `json:"toIndex"`
	TileChangeStartTick uint64 `json:"tileChangeStartTick"`
	TileChangeDurTicks  uint64 `json:"tileChangeDurTicks"`
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
