package rooms

import "time"

type Room struct {
	ID         string
	Name       string
	HostID     string
	MaxPlayers int
	Status     RoomStatus
	CreatedAt  time.Time
	UpdatedAt  time.Time

	Tick uint64

	Phase           Phase
	PhaseEndsAtTick uint64

	Seed uint32

	Clients map[int]*Client
	Players map[int]*PlayerState
	Map     *TileMap

	RoleTaken map[Role]bool // RoleTaken is used in the lobby to tell each client which roles are and are not available
}

func NewRoom(id string) *Room {
	now := time.Now()
	seed := uint32(now.UnixNano())
	roleTaken := map[Role]bool{RoleGoldBot: false, RoleSilverBot: false, RoleWhiteBot: false, RoleBlackBot: false}
	return &Room{
		ID:         id,
		Name:       "Room",
		MaxPlayers: 4,
		Status:     RoomStatusOpen,
		CreatedAt:  now,
		UpdatedAt:  now,
		Phase:      PhaseLobby,
		Seed:       seed,
		Clients:    make(map[int]*Client),
		Players:    make(map[int]*PlayerState),
		Map:        NewTileMap(WorldCols, WorldRows, int64(seed)),
		RoleTaken:  roleTaken,
	}
}
