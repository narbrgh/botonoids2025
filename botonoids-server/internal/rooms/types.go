package rooms

type RoomStatus string

const (
	RoomStatusOpen     RoomStatus = "open"
	RoomStatusStarting RoomStatus = "starting"
	RoomStatusInGame   RoomStatus = "in_game"
)

type PlayerRef struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Ready    bool   `json:"ready"`
}
