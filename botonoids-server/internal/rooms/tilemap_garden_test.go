package rooms

import "testing"

func TestCheckForGardenFriendlyWallsBuildsGarden(t *testing.T) {
	tm := NewTileMap(7, 7, 1)

	const (
		foundationIndex uint8 = 5
		wallIndex       uint8 = 6
		gardenIndex     uint8 = 7
	)

	// New wall is at (3,2). Force the flood-fill to only evaluate the enclosed
	// region below it.
	tm.SetTile(3, 2, wallIndex)
	tm.SetTile(2, 2, wallIndex)
	tm.SetTile(4, 2, wallIndex)
	tm.SetTile(3, 1, wallIndex)

	// Enclose tile (3,3) entirely with friendly walls.
	tm.SetTile(2, 3, wallIndex)
	tm.SetTile(4, 3, wallIndex)
	tm.SetTile(3, 4, wallIndex)
	tm.SetTile(3, 3, 0)

	madeGarden, _, numGardensBuilt := tm.CheckForGarden(3, 2, foundationIndex, wallIndex, gardenIndex, 1)
	if !madeGarden {
		t.Fatalf("expected garden to be built")
	}
	if numGardensBuilt != 1 {
		t.Fatalf("expected exactly 1 garden tile, got %d", numGardensBuilt)
	}

	i, ok := tm.GetTileIndex(3, 3)
	if !ok {
		t.Fatalf("expected tile (3,3) to be in bounds")
	}
	if i != gardenIndex {
		t.Fatalf("expected tile (3,3) to become garden index %d, got %d", gardenIndex, i)
	}
}

func TestCheckForGardenEnemyWallInvalidatesRegion(t *testing.T) {
	tm := NewTileMap(7, 7, 1)

	const (
		foundationIndex uint8 = 5
		wallIndex       uint8 = 6
		enemyWallIndex  uint8 = 9
		gardenIndex     uint8 = 7
	)

	// New wall is at (3,2). Force the flood-fill to only evaluate the enclosed
	// region below it.
	tm.SetTile(3, 2, wallIndex)
	tm.SetTile(2, 2, wallIndex)
	tm.SetTile(4, 2, wallIndex)
	tm.SetTile(3, 1, wallIndex)

	// Region around (3,3) uses one enemy wall segment.
	tm.SetTile(2, 3, wallIndex)
	tm.SetTile(4, 3, wallIndex)
	tm.SetTile(3, 4, enemyWallIndex)
	tm.SetTile(3, 3, 0)

	madeGarden, _, numGardensBuilt := tm.CheckForGarden(3, 2, foundationIndex, wallIndex, gardenIndex, 1)
	if madeGarden {
		t.Fatalf("expected no garden when enemy wall is part of enclosure")
	}
	if numGardensBuilt != 0 {
		t.Fatalf("expected 0 garden tiles built, got %d", numGardensBuilt)
	}

	i, ok := tm.GetTileIndex(3, 3)
	if !ok {
		t.Fatalf("expected tile (3,3) to be in bounds")
	}
	if i != 0 {
		t.Fatalf("expected tile (3,3) to remain unchanged, got index %d", i)
	}
}
