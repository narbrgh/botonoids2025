package main

import (
	"fmt"
	"strings"
	"sync"
)

var (
	playerNamesMu sync.RWMutex
	playerNames   = map[int]string{}
)

func defaultPlayerName(playerID int) string {
	return fmt.Sprintf("Player %d", playerID)
}

func getPlayerName(playerID int) string {
	playerNamesMu.RLock()
	defer playerNamesMu.RUnlock()
	if name, ok := playerNames[playerID]; ok && name != "" {
		return name
	}
	return defaultPlayerName(playerID)
}

func setPlayerName(playerID int, name string) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = defaultPlayerName(playerID)
	}
	if len(trimmed) > 24 {
		trimmed = trimmed[:24]
	}

	playerNamesMu.Lock()
	playerNames[playerID] = trimmed
	playerNamesMu.Unlock()
}

func removePlayerName(playerID int) {
	playerNamesMu.Lock()
	delete(playerNames, playerID)
	playerNamesMu.Unlock()
}
