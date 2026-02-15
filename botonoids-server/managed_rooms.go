package main

import (
	"context"
	"fmt"
	"sync"

	"botonoids-server/internal/rooms"
)

var (
	roomManager       = rooms.NewInMemoryManager()
	managedRoomMu     sync.Mutex
	managedRoomID     string
	managedPlayerRoom = map[int]string{}
)

func managedPlayerRef(playerID int) rooms.PlayerRef {
	return rooms.PlayerRef{
		PlayerID: fmt.Sprintf("%d", playerID),
		Name:     getPlayerName(playerID),
		Ready:    false,
	}
}

func ensureManagedRoomFor(playerID int, actor rooms.PlayerRef) (string, error) {
	managedRoomMu.Lock()
	defer managedRoomMu.Unlock()

	if managedRoomID != "" {
		if _, appErr := roomManager.GetRoom(context.Background(), managedRoomID); appErr == nil {
			return managedRoomID, nil
		}
		managedRoomID = ""
	}

	room, appErr := roomManager.CreateRoom(context.Background(), actor, rooms.CreateRoomRequest{
		Name:       "Default Room",
		MaxPlayers: 6,
	})
	if appErr != nil {
		return "", fmt.Errorf("%s: %s", appErr.Code, appErr.Message)
	}
	managedRoomID = room.ID
	managedPlayerRoom[playerID] = room.ID
	return managedRoomID, nil
}

func managedJoinPlayer(playerID int) {
	actor := managedPlayerRef(playerID)
	roomID, err := ensureManagedRoomFor(playerID, actor)
	if err != nil {
		return
	}

	if managedPlayerRoom[playerID] == roomID {
		return
	}

	if _, appErr := roomManager.JoinRoom(context.Background(), actor, rooms.JoinRoomRequest{RoomID: roomID}); appErr != nil {
		return
	}
	managedRoomMu.Lock()
	managedPlayerRoom[playerID] = roomID
	managedRoomMu.Unlock()
}

func managedListRooms(playerID int) ([]rooms.RoomSummary, error) {
	list, err := roomManager.ListRooms(context.Background())
	if err != nil {
		return nil, err
	}
	return list, nil
}

func managedCreateRoom(playerID int, name string, maxPlayers int) (string, *rooms.AppError) {
	actor := managedPlayerRef(playerID)
	room, appErr := roomManager.CreateRoom(context.Background(), actor, rooms.CreateRoomRequest{
		Name:       name,
		MaxPlayers: maxPlayers,
	})
	if appErr != nil {
		return "", appErr
	}
	managedRoomMu.Lock()
	managedPlayerRoom[playerID] = room.ID
	managedRoomMu.Unlock()
	return room.ID, nil
}

func managedJoinRoom(playerID int, roomID string) *rooms.AppError {
	actor := managedPlayerRef(playerID)
	_, appErr := roomManager.JoinRoom(context.Background(), actor, rooms.JoinRoomRequest{RoomID: roomID})
	if appErr != nil {
		return appErr
	}
	managedRoomMu.Lock()
	managedPlayerRoom[playerID] = roomID
	managedRoomMu.Unlock()
	return nil
}

func managedLeaveRoom(playerID int) *rooms.AppError {
	managedRoomMu.Lock()
	roomID := managedPlayerRoom[playerID]
	delete(managedPlayerRoom, playerID)
	managedRoomMu.Unlock()

	if roomID == "" {
		return nil
	}

	_, appErr := roomManager.LeaveRoom(context.Background(), managedPlayerRef(playerID), rooms.LeaveRoomRequest{RoomID: roomID})
	if appErr != nil {
		return appErr
	}

	if _, stillThere := roomManager.GetRoom(context.Background(), roomID); stillThere != nil {
		stopRoomRunner(roomID)
	}

	return nil
}

func managedGetPlayerRoomID(playerID int) string {
	managedRoomMu.Lock()
	defer managedRoomMu.Unlock()
	return managedPlayerRoom[playerID]
}

func managedLeavePlayer(playerID int) {
	_ = managedLeaveRoom(playerID)
}

func managedSetPlayerReady(playerID int, ready bool) {
	managedRoomMu.Lock()
	roomID := managedPlayerRoom[playerID]
	managedRoomMu.Unlock()
	if roomID == "" {
		return
	}

	_, _ = roomManager.SetReady(context.Background(), managedPlayerRef(playerID), rooms.SetReadyRequest{
		RoomID: roomID,
		Ready:  ready,
	})
}

func managedSyncStatusFromPhase(roomID string, phase rooms.Phase) {
	status := rooms.RoomStatusOpen
	switch phase {
	case rooms.PhaseCountdown:
		status = rooms.RoomStatusStarting
	case rooms.PhasePlaying:
		status = rooms.RoomStatusInGame
	default:
		status = rooms.RoomStatusOpen
	}

	_, _ = roomManager.SetStatus(context.Background(), roomID, status)
}
