package main

import "time"

type Room struct {
	ID   string
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
	seed := uint32(time.Now().UnixNano())
	roleTaken := map[Role]bool{RoleGoldBot: false, RoleSilverBot: false, RoleWhiteBot: false, RoleBlackBot: false}
	return &Room{
		ID:        id,
		Phase:     PhaseLobby,
		Seed:      seed,
		Clients:   make(map[int]*Client),
		Players:   make(map[int]*PlayerState),
		Map:       NewTileMap(WorldCols, WorldRows, int64(seed)),
		RoleTaken: roleTaken,
	}
}
