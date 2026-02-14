package rooms

type RoomSummary struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	HostID      string     `json:"hostId"`
	PlayerCount int        `json:"playerCount"`
	MaxPlayers  int        `json:"maxPlayers"`
	Status      RoomStatus `json:"status"`
	CreatedAt   int64      `json:"createdAtUnix"`
}

type ListRoomsResponse struct {
	Rooms []RoomSummary `json:"rooms"`
}

type CreateRoomRequest struct {
	Name       string `json:"name"`
	MaxPlayers int    `json:"maxPlayers"`
}

type JoinRoomRequest struct {
	RoomID string `json:"roomId"`
}

type LeaveRoomRequest struct {
	RoomID string `json:"roomId"`
}

type SetReadyRequest struct {
	RoomID string `json:"roomId"`
	Ready  bool   `json:"ready"`
}

type StartGameRequest struct {
	RoomID string `json:"roomId"`
}
