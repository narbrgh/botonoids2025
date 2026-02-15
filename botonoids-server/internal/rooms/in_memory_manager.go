package rooms

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type InMemoryManager struct {
	mu                sync.RWMutex
	roomsByID         map[string]*Room
	playerToRoom      map[string]string // playerID -> roomID
	nowFn             func() time.Time
	idFn              func() string
	minPlayersToStart int
}

func NewInMemoryManager() *InMemoryManager {
	return &InMemoryManager{
		roomsByID:         map[string]*Room{},
		playerToRoom:      map[string]string{},
		nowFn:             time.Now,
		idFn:              defaultID,
		minPlayersToStart: 2,
	}
}

func (m *InMemoryManager) ListRooms(_ context.Context) ([]RoomSummary, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	rooms := make([]RoomSummary, 0, len(m.roomsByID))
	for _, room := range m.roomsByID {
		rooms = append(rooms, m.toRoomSummaryLocked(room))
	}

	sort.Slice(rooms, func(i, j int) bool {
		return rooms[i].CreatedAt < rooms[j].CreatedAt
	})
	return rooms, nil
}

func (m *InMemoryManager) CreateRoom(_ context.Context, actor PlayerRef, req CreateRoomRequest) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if actor.PlayerID == "" {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "missing actor player id"}
	}
	if _, ok := m.playerToRoom[actor.PlayerID]; ok {
		return nil, &AppError{Code: ErrAlreadyInRoom, Message: "player is already in a room"}
	}

	name := strings.TrimSpace(req.Name)
	if len(name) < 1 || len(name) > 32 {
		return nil, &AppError{Code: ErrInvalidName, Message: "room name must be between 1 and 32 chars"}
	}

	maxPlayers := req.MaxPlayers
	if maxPlayers < 2 || maxPlayers > 8 {
		maxPlayers = 6
	}

	now := m.nowFn()
	room := NewRoom(m.idFn())
	room.Name = name
	room.HostID = actor.PlayerID
	room.MaxPlayers = maxPlayers
	room.Status = RoomStatusOpen
	room.CreatedAt = now
	room.UpdatedAt = now
	actorID, convErr := playerIDToInt(actor.PlayerID)
	if convErr != nil {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "player id must be numeric"}
	}
	room.Players[actorID] = &PlayerState{ID: actorID, Name: actor.Name, Ready: false}

	m.roomsByID[room.ID] = room
	m.playerToRoom[actor.PlayerID] = room.ID
	return cloneRoom(room), nil
}

func (m *InMemoryManager) JoinRoom(_ context.Context, actor PlayerRef, req JoinRoomRequest) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if actor.PlayerID == "" || req.RoomID == "" {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "missing player id or room id"}
	}
	if _, ok := m.playerToRoom[actor.PlayerID]; ok {
		return nil, &AppError{Code: ErrAlreadyInRoom, Message: "player is already in a room"}
	}

	room, ok := m.roomsByID[req.RoomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}
	if room.Status == RoomStatusInGame {
		return nil, &AppError{Code: ErrRoomInGame, Message: "room is already in game"}
	}
	if len(room.Players) >= room.MaxPlayers {
		return nil, &AppError{Code: ErrRoomFull, Message: "room is full"}
	}

	actorID, convErr := playerIDToInt(actor.PlayerID)
	if convErr != nil {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "player id must be numeric"}
	}
	room.Players[actorID] = &PlayerState{ID: actorID, Name: actor.Name, Ready: false}
	m.playerToRoom[actor.PlayerID] = room.ID
	room.UpdatedAt = m.nowFn()
	return cloneRoom(room), nil
}

func (m *InMemoryManager) LeaveRoom(_ context.Context, actor PlayerRef, req LeaveRoomRequest) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if actor.PlayerID == "" {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "missing actor player id"}
	}

	roomID := req.RoomID
	if roomID == "" {
		roomID = m.playerToRoom[actor.PlayerID]
	}
	room, ok := m.roomsByID[roomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}

	actorID, convErr := playerIDToInt(actor.PlayerID)
	if convErr != nil {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "player id must be numeric"}
	}
	if _, ok := room.Players[actorID]; !ok {
		return nil, &AppError{Code: ErrNotInRoom, Message: "player is not in this room"}
	}

	delete(m.playerToRoom, actor.PlayerID)
	delete(room.Players, actorID)
	if len(room.Players) == 0 {
		delete(m.roomsByID, room.ID)
		return nil, nil
	}

	if room.HostID == actor.PlayerID {
		room.HostID = firstPlayerIDString(room.Players)
	}
	room.UpdatedAt = m.nowFn()
	room.Status = RoomStatusOpen
	for _, p := range room.Players {
		p.Ready = false
	}
	return cloneRoom(room), nil
}

func (m *InMemoryManager) SetReady(_ context.Context, actor PlayerRef, req SetReadyRequest) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if actor.PlayerID == "" || req.RoomID == "" {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "missing player id or room id"}
	}

	room, ok := m.roomsByID[req.RoomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}

	actorID, convErr := playerIDToInt(actor.PlayerID)
	if convErr != nil {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "player id must be numeric"}
	}
	p, ok := room.Players[actorID]
	if !ok {
		return nil, &AppError{Code: ErrNotInRoom, Message: "player is not in this room"}
	}
	p.Ready = req.Ready
	room.UpdatedAt = m.nowFn()
	return cloneRoom(room), nil
}

func (m *InMemoryManager) StartGame(_ context.Context, actor PlayerRef, req StartGameRequest) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if actor.PlayerID == "" || req.RoomID == "" {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "missing player id or room id"}
	}

	room, ok := m.roomsByID[req.RoomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}
	if room.HostID != actor.PlayerID {
		return nil, &AppError{Code: ErrNotHost, Message: "only host can start the game"}
	}
	if len(room.Players) < m.minPlayersToStart {
		return nil, &AppError{Code: ErrInvalidRequest, Message: "not enough players to start"}
	}
	for _, p := range room.Players {
		if !p.Ready {
			return nil, &AppError{Code: ErrInvalidRequest, Message: "all players must be ready"}
		}
	}

	room.Status = RoomStatusInGame
	room.UpdatedAt = m.nowFn()
	return cloneRoom(room), nil
}

func (m *InMemoryManager) SetStatus(_ context.Context, roomID string, status RoomStatus) (*Room, *AppError) {
	m.mu.Lock()
	defer m.mu.Unlock()

	room, ok := m.roomsByID[roomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}
	room.Status = status
	room.UpdatedAt = m.nowFn()
	return cloneRoom(room), nil
}

func (m *InMemoryManager) GetRoom(_ context.Context, roomID string) (*Room, *AppError) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	room, ok := m.roomsByID[roomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}
	return cloneRoom(room), nil
}

// GetRoomRef returns the underlying in-memory room pointer.
// Callers must coordinate concurrent mutations.
func (m *InMemoryManager) GetRoomRef(roomID string) (*Room, *AppError) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	room, ok := m.roomsByID[roomID]
	if !ok {
		return nil, &AppError{Code: ErrRoomNotFound, Message: "room not found"}
	}
	return room, nil
}

func (m *InMemoryManager) toRoomSummaryLocked(room *Room) RoomSummary {
	return RoomSummary{
		ID:          room.ID,
		Name:        room.Name,
		HostID:      room.HostID,
		PlayerCount: len(room.Players),
		MaxPlayers:  room.MaxPlayers,
		Status:      room.Status,
		CreatedAt:   room.CreatedAt.Unix(),
	}
}

func cloneRoom(room *Room) *Room {
	if room == nil {
		return nil
	}
	cloned := *room
	if room.Clients != nil {
		cloned.Clients = room.Clients
	}
	if room.Players != nil {
		cloned.Players = make(map[int]*PlayerState, len(room.Players))
		for id, p := range room.Players {
			if p == nil {
				cloned.Players[id] = nil
				continue
			}
			cp := *p
			cloned.Players[id] = &cp
		}
	}
	return &cloned
}

func playerIDToInt(playerID string) (int, error) {
	n, err := strconv.Atoi(playerID)
	if err != nil {
		return 0, err
	}
	return n, nil
}

func firstPlayerIDString(players map[int]*PlayerState) string {
	for id := range players {
		return fmt.Sprintf("%d", id)
	}
	return ""
}
