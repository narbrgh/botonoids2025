package rooms

import "math/rand"

type PhaseConfig struct {
	MinPlayers        int
	MaxPlayers        int
	CountdownDurTicks uint64
	GameDurTicks      uint64
	FinishedDurTicks  uint64
}

var phaseCfg = PhaseConfig{
	MinPlayers:        1,
	MaxPlayers:        4,
	CountdownDurTicks: uint64(3 * TickHz),
	GameDurTicks:      uint64(540 * TickHz),
	FinishedDurTicks:  uint64(5 * TickHz),
}

type SpawnPos struct {
	X int
	Y int
}

var spawnPositions = []SpawnPos{
	{SpawnBaseX, SpawnBaseY},
	{WorldCols - SpawnBaseX - 1, SpawnBaseY},
	{WorldCols - SpawnBaseX - 1, WorldRows - SpawnBaseY - 1},
	{SpawnBaseX, WorldRows - SpawnBaseY - 1},
}

func (r *Room) allReady() bool {
	ready := 0
	activePlayers := 0

	//This counts will count how many of each color there are. If it exceeds one per Role, then the game can't start yet.
	//This way we don't have 2 gold players, for example.
	counts := map[Role]int{RoleGoldBot: 0, RoleSilverBot: 0, RoleWhiteBot: 0, RoleBlackBot: 0}

	for _, p := range r.Players {
		// Every connected player must click ready (including observers).
		if !p.Ready {
			return false
		}
		ready++
		if p.SelectedRole != RoleObserver {
			activePlayers++
			p.SetSpecialTilesBasedOnRole()
			counts[p.SelectedRole]++
		}
	}
	//return false if any single color has more than one player
	if counts[RoleGoldBot] > 1 || counts[RoleSilverBot] > 1 || counts[RoleWhiteBot] > 1 || counts[RoleBlackBot] > 1 {
		return false
	}

	return activePlayers >= phaseCfg.MinPlayers && activePlayers <= phaseCfg.MaxPlayers && ready == len(r.Players)
}

func (r *Room) startCountdown() {

	//first, make each player get their correct graphics based on role (and later skin)
	for _, p := range r.Players {
		// if random Role, then select from available bots
		if p.SelectedRole == RoleRandomBot {
			// available is a slice of roles available
			available := []Role{}
			for role, taken := range r.RoleTaken {
				if !taken {
					available = append(available, role)
				}
			}
			p.SelectedRole = available[rand.Intn(len(available))]
			r.RoleTaken[p.SelectedRole] = true
		}

		// if random Model, then select one at random
		if p.SelectedModel == ModelRandomnoid {
			models := []Model{ModelAlphanoid, ModelHerbanoid, ModelBarvinoid}
			p.SelectedModel = models[rand.Intn(len(models))]
		}

	}

	// now randomize the player positions. there are 4 starting positions available,
	// each near a corner (the variable startBaseX and startBaseY tells you how far from the corner each botonoid starts)

	positions := make([]SpawnPos, len(spawnPositions))
	copy(positions, spawnPositions)

	rand.Shuffle(len(positions), func(i, j int) {
		positions[i], positions[j] = positions[j], positions[i]
	})

	i := 0 //have to have i outside of the for loop, instead of using "for i, p", becuase you don't want i incrementing for observers
	for _, p := range r.Players {
		if p.SelectedRole == RoleObserver {
			continue
		}
		if i >= len(positions) { //somehow there was an error. this should never happen
			p.X = 0
			p.Y = 0
		}
		p.X = positions[i].X
		p.Y = positions[i].Y
		i++

		//now reset data for each player
		p.ResetData()
	}

	r.Phase = PhaseCountdown
	r.PhaseEndsAtTick = r.Tick + phaseCfg.CountdownDurTicks
}

func (r *Room) startGame() {

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
