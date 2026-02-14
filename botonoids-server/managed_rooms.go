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
		Name:     fmt.Sprintf("Player %d", playerID),
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
		MaxPlayers: 4,
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

func managedLeavePlayer(playerID int) {
	managedRoomMu.Lock()
	roomID := managedPlayerRoom[playerID]
	delete(managedPlayerRoom, playerID)
	managedRoomMu.Unlock()

	if roomID == "" {
		return
	}
	_, _ = roomManager.LeaveRoom(context.Background(), managedPlayerRef(playerID), rooms.LeaveRoomRequest{RoomID: roomID})
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

func managedSyncStatusFromPhase(phase rooms.Phase) {
	managedRoomMu.Lock()
	roomID := managedRoomID
	managedRoomMu.Unlock()
	if roomID == "" {
		return
	}

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
