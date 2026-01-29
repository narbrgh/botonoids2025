package main

type PhaseConfig struct {
	MinPlayers        int
	CountdownDurTicks uint64
	GameDurTicks      uint64
	FinishedDurTicks  uint64
}

var phaseCfg = PhaseConfig{
	MinPlayers:        2,
	CountdownDurTicks: uint64(3 * TickHz),
	GameDurTicks:      uint64(540 * TickHz),
	FinishedDurTicks:  uint64(5 * TickHz),
}

func (r *Room) allReady() bool {
	ready := 0
	for _, p := range r.Players {
		if p.Ready {
			ready++
		}
	}
	return ready >= phaseCfg.MinPlayers && ready == len(r.Players)
}

func (r *Room) startCountdown() {
	r.Phase = PhaseCountdown
	r.PhaseEndsAtTick = r.Tick + phaseCfg.CountdownDurTicks
}

func (r *Room) startGame() {

	//first, make each player get their correct graphics based on role (and later skin)

	r.Phase = PhasePlaying
	r.PhaseEndsAtTick = r.Tick + phaseCfg.GameDurTicks
	// TODO: reset map / players here
}

func (r *Room) resetToLobby() {
	r.Phase = PhaseLobby
	r.PhaseEndsAtTick = 0

	r.RoleTaken = map[Role]bool{RoleGoldBot: false, RoleSilverBot: false, RoleWhiteBot: false, RoleBlackBot: false}

	for _, p := range r.Players {
		p.Ready = false
		p.Mode = Walking
		p.SelectedRole = RoleObserver
	}
}

func (r *Room) enterResultsScreen() {
	r.Phase = PhaseFinished
	r.PhaseEndsAtTick = r.Tick + phaseCfg.FinishedDurTicks
}

func (r *Room) UpdatePhase() {
	switch r.Phase {
	case PhaseLobby:

		if len(r.Players) >= phaseCfg.MinPlayers && r.allReady() {
			r.startCountdown()
		}
	case PhaseCountdown:
		if r.Tick >= r.PhaseEndsAtTick {
			r.startGame()
		}
		//drop back if someone unreadies
		if !r.allReady() {
			r.resetToLobby()
		}
	case PhasePlaying:
		if r.Tick >= r.PhaseEndsAtTick {
			r.enterResultsScreen()
		}
	case PhaseFinished:
		if r.Tick >= r.PhaseEndsAtTick {
			r.resetToLobby()
		}
	}

}
