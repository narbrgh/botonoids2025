package main

import (
	"botonoids-server/internal/rooms"
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
	MaxTilesColorChange int `json:"maxTilesColorChange"`
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

// ----------------------0-0-0-0-0-0--0-0-0-one-0--==-------------
// Client -> server room phase messages --00-0-199-=-======-------
// ------------             -------   ---------- --=-=-==-=-------
// ------role can be gold, white, pink, or black bot. Future: observer -------

type ReadyCmd struct {
	Type  string      `json:"type"` // "ready"
	Ready bool        `json:"ready"`
	Role  rooms.Role  `json:"role"`  // RoleGoldBot etc
	Model rooms.Model `json:"model"` // ModelAlphanoid etc
}

func decodeReadyCmd(raw json.RawMessage) (ReadyCmd, error) {
	var cmd ReadyCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

//////000000000000-----------------
// server -> client messages regarding lobby messages (role not available etc)
// -0--- -00- 0-32r40-230-30-4 230- asd-0fdslk ;fadsjlk
//-------------------------00000000000000000000000---------

//TODO add a message that the server sends all clients, where it tells them the current state of role selection

/*
type RoleInvalidMsg struct {
	Type     string `json:"type"` //roleInvalid
	PlayerID int    `json:"playerID"`
}

func encodeRoleInvalidMsg(playerID int) ([]byte, error) {
	msg := RoleInvalidMsg{Type: "roleInvalid", PlayerID: playerID}
	return json.Marshal(msg)
}
*/

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
	Type string        `json:"type"` // "move"
	Dir  rooms.DirType `json:"dir"`  // "up" | "down" | "left" | "right"
}

func decodeMoveCmd(raw json.RawMessage) (MoveCmd, error) {
	var cmd MoveCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type FacingCmd struct {
	Type string        `json:"type"` // "facing"
	Dir  rooms.DirType `json:"dir"`  // "up" | "down" | "left" | "right"
}

func decodeFacingCmd(raw json.RawMessage) (FacingCmd, error) {
	var cmd FacingCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type ActionCmd struct {
	Type string `json:"type"` // "action"
}

type ActionDownCmd struct {
	Type string `json:"type"` // "actionDown"
}

type ActionUpCmd struct {
	Type string `json:"type"` // "actionUp"
}

type ChangeItemCmd struct {
	Type string `json:"type"` // "changeItem"
}

type UseItemCmd struct {
	Type string `json:"type"` // "useItem"
}

type InputCmd struct {
	Type string         `json:"type"` // "input"
	Dir  *rooms.DirType `json:"dir"`  // "up|down|left|right". nil = no input
}

func decodeInputCmd(raw json.RawMessage) (InputCmd, error) {
	var cmd InputCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type RoomsListCmd struct {
	Type string `json:"type"`
}

type RoomCreateCmd struct {
	Type       string `json:"type"`
	Name       string `json:"name"`
	MaxPlayers int    `json:"maxPlayers"`
}

func decodeRoomCreateCmd(raw json.RawMessage) (RoomCreateCmd, error) {
	var cmd RoomCreateCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type RoomJoinCmd struct {
	Type   string `json:"type"`
	RoomID string `json:"roomId"`
}

func decodeRoomJoinCmd(raw json.RawMessage) (RoomJoinCmd, error) {
	var cmd RoomJoinCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type RoomLeaveCmd struct {
	Type string `json:"type"`
}

type RoleSelectCmd struct {
	Type string     `json:"type"`
	Role rooms.Role `json:"role"`
}

func decodeRoleSelectCmd(raw json.RawMessage) (RoleSelectCmd, error) {
	var cmd RoleSelectCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type NameCmd struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

func decodeNameCmd(raw json.RawMessage) (NameCmd, error) {
	var cmd NameCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type ChatCmd struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func decodeChatCmd(raw json.RawMessage) (ChatCmd, error) {
	var cmd ChatCmd
	err := json.Unmarshal(raw, &cmd)
	return cmd, err
}

type PlayerSnapshotMsg struct {
	Type            string               `json:"type"` // "playerSnapshot"
	Tick            uint64               `json:"tick"`
	Phase           rooms.Phase          `json:"phase"`
	PhaseEndsAtTick uint64               `json:"phaseEndsAtTick"`
	MapChecksum     uint32               `json:"mapChecksum"`
	Players         []PlayerSnapshotLite `json:"players"`
}

// PlayerSnapshotLite keeps role/model in the fast path (used for rendering),
// while name is sent via PlayerMetaSnapshotMsg.
type PlayerSnapshotLite struct {
	ID        int            `json:"id"`
	Connected bool           `json:"connected"`
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Facing    rooms.DirType  `json:"facing"`
	IntentDir *rooms.DirType `json:"intentDir,omitempty"`
	Role      rooms.Role     `json:"role"`
	Model     rooms.Model    `json:"model"`

	Moving        bool   `json:"moving"`
	FromX         int    `json:"fromX"`
	FromY         int    `json:"fromY"`
	ToX           int    `json:"toX"`
	ToY           int    `json:"toY"`
	MoveStartTick uint64 `json:"moveStartTick"`
	MoveDurTicks  uint64 `json:"moveDurTicks"`

	Mode                rooms.ModeType `json:"mode"`
	NumColorChangesLeft int            `json:"numColorChangesLeft"`
	NumWallsLeft        int            `json:"numWallsLeft"`
	CooldownStartTick   uint64         `json:"cooldownStartTick"`
	CooldownDurTicks    uint64         `json:"cooldownDurTicks"`

	Score               int            `json:"score"`
	SelectedItem        rooms.ItemType `json:"selectedItem"`
	NumWallbreakersLeft int            `json:"numWallbreakersLeft"`
	NumSillyPadsLeft    int            `json:"numSillyPadsLeft"`

	Ready            bool       `json:"ready"`
	ResultsRole      rooms.Role `json:"resultsRole"`
	ResultsDismissed bool       `json:"resultsDismissed"`
}

type PlayerMeta struct {
	ID    int         `json:"id"`
	Name  string      `json:"name,omitempty"`
	Role  rooms.Role  `json:"role"`
	Model rooms.Model `json:"model"`
}

type PlayerMetaSnapshotMsg struct {
	Type    string       `json:"type"` // "playerMetaSnapshot"
	Players []PlayerMeta `json:"players"`
}

type TileMapSnapshotMsg struct {
	Type    string         `json:"type"` // "tileMapSnapshot"
	Tick    uint64         `json:"tick"`
	Phase   rooms.Phase    `json:"phase"`
	TileMap *rooms.TileMap `json:"tileMap"`
}

type TileChangeMsg struct { // this changes a single tile
	Type  string `json:"type"` // "tileChange"
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Index uint8  `json:"index"`
}

type TileChangeListMsg struct { // a list of several tile changes, such as when a combo or a garden is achieved
	Type           string            `json:"type"` //tileChangeList
	TileChangeList []rooms.TileDelta `json:"tileChangeList"`
}

type SillyPadMsg struct {
	Type          string               `json:"type"` //sillyPadMsg
	Action        rooms.CreateOrRemove `json:"action"`
	X             int                  `json:"x"`
	Y             int                  `json:"y"`
	OwnerId       int                  `json:"ownerId"`
	ExpiresAtTick uint64               `json:"expiresAtTick"`
}

type WallbreakerMsg struct {
	Type          string               `json:"type"` //wallbreakerMsg
	Action        rooms.CreateOrRemove `json:"action"`
	X             int                  `json:"x"`
	Y             int                  `json:"y"`
	StartTick     uint64               `json:"startTick"`
	ExpiresAtTick uint64               `json:"expiresAtTick"`
}

type TileInitiateChangeMsg struct {
	Type                string `json:"type"` // "tileInitiateChange"
	X                   int    `json:"x"`
	Y                   int    `json:"y"`
	ToIndex             uint8  `json:"toIndex"`
	TileChangeStartTick uint64 `json:"tileChangeStartTick"`
	TileChangeDurTicks  uint64 `json:"tileChangeDurTicks"`
}

type ChatMsg struct {
	Type     string `json:"type"`
	PlayerID int    `json:"playerId"`
	Name     string `json:"name"`
	Text     string `json:"text"`
}

// helper function to encode once
func encodePlayerSnapshot(room *rooms.Room) ([]byte, error) {
	players := make([]PlayerSnapshotLite, 0, len(room.Players))
	for _, p := range room.Players {
		players = append(players, PlayerSnapshotLite{
			ID:                  p.ID,
			Connected:           p.Connected,
			X:                   p.X,
			Y:                   p.Y,
			Facing:              p.Facing,
			IntentDir:           p.IntentDir,
			Role:                p.SelectedRole,
			Model:               p.SelectedModel,
			Moving:              p.Moving,
			FromX:               p.FromX,
			FromY:               p.FromY,
			ToX:                 p.ToX,
			ToY:                 p.ToY,
			MoveStartTick:       p.MoveStartTick,
			MoveDurTicks:        p.MoveDurTicks,
			Mode:                p.Mode,
			NumColorChangesLeft: p.NumColorChangesLeft,
			NumWallsLeft:        p.NumWallsLeft,
			CooldownStartTick:   p.CooldownStartTick,
			CooldownDurTicks:    p.CooldownDurTicks,
			Score:               p.Score,
			SelectedItem:        p.SelectedItem,
			NumWallbreakersLeft: p.NumWallbreakersLeft,
			NumSillyPadsLeft:    p.NumSillyPadsLeft,
			Ready:               p.Ready,
			ResultsRole:         p.ResultsRole,
			ResultsDismissed:    p.ResultsDismissed,
		})
	}

	msg := PlayerSnapshotMsg{
		Type:            "playerSnapshot",
		Tick:            room.Tick,
		Phase:           room.Phase,
		PhaseEndsAtTick: room.PhaseEndsAtTick,
		MapChecksum:     computeMapChecksum(room.Map),
		Players:         players,
	}
	return json.Marshal(msg)
}

func encodePlayerMetaSnapshot(room *rooms.Room) ([]byte, error) {
	players := make([]PlayerMeta, 0, len(room.Players))
	for _, p := range room.Players {
		name := p.Name
		if name == "" {
			name = getPlayerName(p.ID)
		}
		players = append(players, PlayerMeta{
			ID:    p.ID,
			Name:  name,
			Role:  p.SelectedRole,
			Model: p.SelectedModel,
		})
	}
	return json.Marshal(PlayerMetaSnapshotMsg{Type: "playerMetaSnapshot", Players: players})
}

func encodeTileMapSnapshotMsg(room *rooms.Room) ([]byte, error) {
	msg := TileMapSnapshotMsg{Type: "tileMapSnapshot", Tick: room.Tick, Phase: room.Phase, TileMap: room.Map}
	return json.Marshal(msg)
}

func mixChecksum(h uint32, v uint64) uint32 {
	h ^= uint32(v) + 0x9e3779b9 + (h << 6) + (h >> 2)
	return h
}

func computeMapChecksum(tm *rooms.TileMap) uint32 {
	// Lightweight deterministic hash over authoritative map state for desync detection.
	var h uint32 = 2166136261
	h = mixChecksum(h, uint64(tm.Cols))
	h = mixChecksum(h, uint64(tm.Rows))

	for y := 0; y < tm.Rows; y++ {
		for x := 0; x < tm.Cols; x++ {
			t := tm.Tiles[y][x]
			h = mixChecksum(h, uint64(t.Index))
			if t.Changing {
				h = mixChecksum(h, 1)
			} else {
				h = mixChecksum(h, 0)
			}
			h = mixChecksum(h, t.TileChangeStartTick)
			h = mixChecksum(h, t.TileChangeDurTicks)

			sp := tm.SillyPads[y][x]
			if sp.Active {
				h = mixChecksum(h, 1)
			} else {
				h = mixChecksum(h, 0)
			}
			h = mixChecksum(h, uint64(uint32(sp.OwnerId)))
			h = mixChecksum(h, sp.ExpiresAtTick)
		}
	}

	h = mixChecksum(h, uint64(len(tm.Wallbreakers)))
	for _, wb := range tm.Wallbreakers {
		h = mixChecksum(h, uint64(uint32(wb.X)))
		h = mixChecksum(h, uint64(uint32(wb.Y)))
		h = mixChecksum(h, wb.StartTick)
		h = mixChecksum(h, wb.ExpiresAtTick)
	}

	return h
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
