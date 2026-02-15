package main

import (
	"fmt"
	"sync"

	"botonoids-server/internal/rooms"
)

type roomRunner struct {
	roomID  string
	room    *rooms.Room
	regCh   chan Register
	unregCh chan Unregister
	cmdCh   chan QueuedCmd
	stopCh  chan struct{}
}

var (
	runnersMu sync.Mutex
	runners   = map[string]*roomRunner{}
)

func ensureRoomRunner(roomID string) (*roomRunner, error) {
	runnersMu.Lock()
	defer runnersMu.Unlock()

	if rr, ok := runners[roomID]; ok {
		return rr, nil
	}

	room, appErr := roomManager.GetRoomRef(roomID)
	if appErr != nil {
		return nil, fmt.Errorf("%s: %s", appErr.Code, appErr.Message)
	}

	rr := &roomRunner{
		roomID:  roomID,
		room:    room,
		regCh:   make(chan Register, 64),
		unregCh: make(chan Unregister, 64),
		cmdCh:   make(chan QueuedCmd, 1024),
		stopCh:  make(chan struct{}),
	}
	runners[roomID] = rr
	go runGameLoop(room, rr.regCh, rr.unregCh, rr.cmdCh, rr.stopCh)
	return rr, nil
}

func stopRoomRunner(roomID string) {
	runnersMu.Lock()
	rr, ok := runners[roomID]
	if ok {
		delete(runners, roomID)
	}
	runnersMu.Unlock()

	if ok {
		close(rr.stopCh)
	}
}

func runtimeRegisterClient(roomID string, client *rooms.Client) error {
	rr, err := ensureRoomRunner(roomID)
	if err != nil {
		return err
	}
	rr.regCh <- Register{Client: client}
	return nil
}

func runtimeUnregisterClient(roomID string, playerID int) {
	runnersMu.Lock()
	rr, ok := runners[roomID]
	runnersMu.Unlock()
	if !ok {
		return
	}
	rr.unregCh <- Unregister{PlayerID: playerID}
}

func runtimeRouteCommand(roomID string, qc QueuedCmd) {
	runnersMu.Lock()
	rr, ok := runners[roomID]
	runnersMu.Unlock()
	if !ok {
		return
	}
	rr.cmdCh <- qc
}
