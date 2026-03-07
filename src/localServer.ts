// localServer.ts
// TypeScript port of the Go game server (botonoids-server).
// Runs entirely in-browser for offline / local-multiplayer play.

import type {
  PlayerSnapshotMsg, PlayerDeltaMsg, PlayerMetaSnapshotMsg,
  PlayerStatusSnapshotMsg, TileMapSnapshotMsg, TileChangeMsg,
  TileInitiateChangeMsg, TileChangeListMsg, SillyPadMsg, WallbreakerMsg,
  ConfigMsg, Phase, Role, Model, DirType, ItemType, BotonoidMode,
  SnapshotTile,
} from './protocol';
import type { Command } from './commands';
import { mulberry32 } from './rng';

// ── Constants (mirrors botonoids-server/internal/rooms/constants.go) ──────────
const TICK_HZ = 20;
const MOVE_TICKS = 6;
const COLOR_CHANGE_TICKS = 35;
const COOLDOWN_TICKS = 45;
const GHOST_TICKS = 40 * TICK_HZ;
const SILLY_PAD_TICKS = 80 * TICK_HZ;
const WALLBREAKER_TICKS = 3 * TICK_HZ;
const WORLD_COLS = 30;
const WORLD_ROWS = 16;
const SPAWN_BASE_X = 6;
const SPAWN_BASE_Y = 3;
const NUM_COLORS = 5;
const MINIMUM_COMBO = 6;
const MAX_COLOR_CHANGES = 5;
const DEFAULT_SILLY_PADS = 5;
const DEFAULT_WALLBREAKERS = 1;
const POINTS_PER_WALL = 1;
const POINTS_PER_GARDEN = 2;
const GARDEN_DESTROY_TICKS_PER_TILE = 1;
const EXPLOSION_RADIUS = 2;
const COUNTDOWN_DUR_TICKS = 3 * TICK_HZ;
const GAME_DUR_TICKS = 540 * TICK_HZ;

const SPAWN_POSITIONS = [
  { x: SPAWN_BASE_X,                  y: SPAWN_BASE_Y },
  { x: WORLD_COLS - SPAWN_BASE_X - 1, y: SPAWN_BASE_Y },
  { x: WORLD_COLS - SPAWN_BASE_X - 1, y: WORLD_ROWS - SPAWN_BASE_Y - 1 },
  { x: SPAWN_BASE_X,                  y: WORLD_ROWS - SPAWN_BASE_Y - 1 },
];

// ── Public types ──────────────────────────────────────────────────────────────
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type OfflinePlayerConfig = {
  id: number;
  name: string;
  role: Role;   // goldBot | pinkBot | whiteBot | blackBot
  model: Model;
  isHuman: boolean;
  difficulty?: BotDifficulty;
};

export type LocalServerCallbacks = {
  onConfig:               (msg: ConfigMsg) => void;
  onHello:                (msg: { type: 'hello'; playerId: number }) => void;
  onPlayerSnapshot:       (msg: PlayerSnapshotMsg) => void;
  onPlayerDelta:          (msg: PlayerDeltaMsg) => void;
  onPlayerMetaSnapshot:   (msg: PlayerMetaSnapshotMsg) => void;
  onPlayerStatusSnapshot: (msg: PlayerStatusSnapshotMsg) => void;
  onTileMapSnapshot:      (msg: TileMapSnapshotMsg) => void;
  onTileChange:           (msg: TileChangeMsg) => void;
  onTileChangeList:       (msg: TileChangeListMsg) => void;
  onTileInitiateChange:   (msg: TileInitiateChangeMsg) => void;
  onSillyPadMsg:          (msg: SillyPadMsg) => void;
  onWallbreakerMsg:       (msg: WallbreakerMsg) => void;
};

// ── Internal tile-map types ───────────────────────────────────────────────────
type TileData = {
  index: number;
  changing: boolean;
  tileChangeStartTick: number;
  tileChangeDurTicks: number;
};

type SillyPadCell = {
  active: boolean;
  ownerId: number;
  startTick: number;
  expiresAtTick: number;
};

type WallbreakerEntry = {
  x: number; y: number;
  startTick: number;
  expiresAtTick: number;
};

type RevertGardenCell = { active: boolean; tick: number };

type TileDelta = { x: number; y: number; index: number };
type DestroyedPair = { walls: number; gardens: number };
type DestroyedTiles = { gold: DestroyedPair; pink: DestroyedPair; white: DestroyedPair; black: DestroyedPair };
type ExplosionEvent = { x: number; y: number };

// ── LocalTileMap (port of tilemap.go) ────────────────────────────────────────
class LocalTileMap {
  cols: number;
  rows: number;
  tiles: TileData[][];
  sillyPads: SillyPadCell[][];
  wallbreakers: WallbreakerEntry[];

  private rng: () => number;
  private tempMap: boolean[][];
  private gardenMap: boolean[][];
  private regionMap: boolean[][];
  private tempBFSMap: number[][];
  private revertGarden: RevertGardenCell[][];
  private pending: TileDelta[];
  private leftEdge = false;
  private rightEdge = false;
  private topEdge = false;
  private bottomEdge = false;
  private enemyWall = false;

  constructor(cols: number, rows: number, seed: number) {
    this.cols = cols;
    this.rows = rows;
    this.rng = mulberry32(seed);

    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        index: Math.floor(this.rng() * NUM_COLORS),
        changing: false,
        tileChangeStartTick: 0,
        tileChangeDurTicks: 0,
      }))
    );
    this.sillyPads = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ active: false, ownerId: -1, startTick: 0, expiresAtTick: 0 }))
    );
    this.tempMap    = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    this.gardenMap  = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    this.regionMap  = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    this.tempBFSMap = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
    this.revertGarden = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ active: false, tick: 0 }))
    );
    this.wallbreakers = [];
    this.pending = [];
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  getIndex(x: number, y: number): number | null {
    return this.inBounds(x, y) ? this.tiles[y][x].index : null;
  }

  setTile(x: number, y: number, index: number): void {
    if (this.inBounds(x, y)) this.tiles[y][x].index = index;
  }

  setTileAndAdd(x: number, y: number, index: number): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y][x].index = index;
    this.pending.push({ x, y, index });
  }

  addChange(x: number, y: number, index: number): void {
    this.pending.push({ x, y, index });
  }

  pendingChanges(): TileDelta[] { return this.pending; }
  resetChangeMap(): void { this.pending = []; }

  isWall(index: number): boolean {
    return index === 6 || index === 9 || index === 12 || index === 15;
  }
  isGarden(index: number): boolean {
    return index === 7 || index === 10 || index === 13 || index === 16;
  }
  isFoundationWallOrFlower(index: number): boolean { return index >= NUM_COLORS; }
  isGardenable(index: number): boolean {
    return index < NUM_COLORS || index === 5 || index === 8 || index === 11 || index === 14;
  }

  countTilesOfIndex(target: number): number {
    let n = 0;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.tiles[y][x].index === target) n++;
    return n;
  }

  // ── flood-fill helpers ──
  private resetTemp(): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) this.tempMap[y][x] = false;
  }
  private resetRegion(): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) this.regionMap[y][x] = false;
  }
  private resetTempRegionGarden(): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        this.tempMap[y][x] = false;
        this.gardenMap[y][x] = false;
        this.regionMap[y][x] = false;
      }
  }
  private resetBFS(): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) this.tempBFSMap[y][x] = -1;
  }
  private resetEdges(): void {
    this.leftEdge = this.rightEdge = this.topEdge = this.bottomEdge = this.enemyWall = false;
  }
  private edgesHit(): number {
    return (this.leftEdge ? 1 : 0) + (this.rightEdge ? 1 : 0) +
           (this.topEdge  ? 1 : 0) + (this.bottomEdge ? 1 : 0);
  }

  private floodFill(x: number, y: number, index: number): number {
    if (!this.inBounds(x, y) || this.tempMap[y][x] || this.tiles[y][x].index !== index) return 0;
    this.tempMap[y][x] = true;
    return 1 +
      this.floodFill(x + 1, y, index) + this.floodFill(x - 1, y, index) +
      this.floodFill(x, y + 1, index) + this.floodFill(x, y - 1, index);
  }

  checkForCombo(x: number, y: number, index: number): number {
    this.resetTemp();
    this.tempMap[y][x] = true;
    return 1 +
      this.floodFill(x + 1, y, index) + this.floodFill(x - 1, y, index) +
      this.floodFill(x, y + 1, index) + this.floodFill(x, y - 1, index);
  }

  initiateCombo(foundationIndex: number): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        if (this.tempMap[y][x]) { this.setTile(x, y, foundationIndex); this.addChange(x, y, foundationIndex); }
        this.tempMap[y][x] = false;
      }
  }

  private gardenFloodFill(x: number, y: number, wallIndex: number): void {
    if (!this.inBounds(x, y)) {
      if (x < 0)              this.leftEdge   = true;
      else if (x >= this.cols) this.rightEdge  = true;
      else if (y < 0)          this.topEdge    = true;
      else                     this.bottomEdge = true;
      return;
    }
    if (this.tempMap[y][x]) return;
    this.tempMap[y][x]   = true;
    this.regionMap[y][x] = true;
    const i = this.tiles[y][x].index;
    if (this.isWall(i)) { if (i !== wallIndex) this.enemyWall = true; return; }
    this.gardenFloodFill(x - 1, y, wallIndex);
    this.gardenFloodFill(x + 1, y, wallIndex);
    this.gardenFloodFill(x, y - 1, wallIndex);
    this.gardenFloodFill(x, y + 1, wallIndex);
  }

  private mergeRegionToGarden(): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.regionMap[y][x] && this.isGardenable(this.tiles[y][x].index))
          this.gardenMap[y][x] = true;
  }

  checkForGarden(
    x: number, y: number,
    foundationIndex: number, wallIndex: number, gardenIndex: number
  ): { madeGarden: boolean; numFoundationsDestroyed: number; numGardensBuilt: number } {
    this.resetTempRegionGarden();
    let madeGarden = false;
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      this.resetTemp(); this.tempMap[y][x] = true;
      this.resetEdges(); this.resetRegion();
      if (this.inBounds(nx, ny) && !this.tempMap[ny][nx] && this.isGardenable(this.tiles[ny][nx].index)) {
        this.gardenFloodFill(nx, ny, wallIndex);
        if (!this.enemyWall && this.edgesHit() <= 2) {
          madeGarden = true;
          this.mergeRegionToGarden();
        }
      }
    }
    let numFoundationsDestroyed = 0, numGardensBuilt = 0;
    if (madeGarden) {
      for (let yc = 0; yc < this.rows; yc++)
        for (let xc = 0; xc < this.cols; xc++)
          if (this.gardenMap[yc][xc]) {
            if (this.tiles[yc][xc].index === foundationIndex) numFoundationsDestroyed++;
            this.tiles[yc][xc].index = gardenIndex;
            this.addChange(xc, yc, gardenIndex);
            numGardensBuilt++;
          }
    }
    return { madeGarden, numFoundationsDestroyed, numGardensBuilt };
  }

  // Returns combo size if >= MINIMUM_COMBO, else 0.  Tile is changed in place.
  initiateColorChange(x: number, y: number, toIndex: number, startTick: number, numTicks: number): number {
    const comboSize = this.checkForCombo(x, y, toIndex);
    if (comboSize >= MINIMUM_COMBO) return comboSize;
    this.resetTemp();
    this.tiles[y][x].index = toIndex;
    this.tiles[y][x].changing = true;
    this.tiles[y][x].tileChangeStartTick = startTick;
    this.tiles[y][x].tileChangeDurTicks  = numTicks;
    return 0;
  }

  getIndexAfterColorChange(x: number, y: number): number | null {
    if (!this.inBounds(x, y)) return null;
    const i = this.tiles[y][x].index;
    return i === NUM_COLORS - 1 ? 0 : i + 1;
  }

  checkColorChangeResult(x: number, y: number): 'ok' | 'failDecrement' | 'failNoDecrement' {
    const i = this.getIndex(x, y);
    if (i === null) return 'failNoDecrement';
    if (this.isFoundationWallOrFlower(i)) return 'failNoDecrement';
    if (this.tiles[y][x].changing) return 'failDecrement';
    return 'ok';
  }

  checkMovement(nx: number, ny: number, playerId: number, wallIndex: number, ghost: boolean): boolean {
    if (!this.inBounds(nx, ny)) return false;
    if (ghost) return true;
    const ti = this.tiles[ny][nx].index;
    if (this.isWall(ti) && ti !== wallIndex) return false;
    if (this.sillyPads[ny][nx].active && this.sillyPads[ny][nx].ownerId !== playerId) return false;
    return true;
  }

  tryBuildWall(x: number, y: number, foundationIndex: number, wallIndex: number): boolean {
    const i = this.getIndex(x, y);
    if (i === null || i !== foundationIndex) return false;
    this.setTileAndAdd(x, y, wallIndex);
    return true;
  }

  resetFoundationTiles(foundationIndex: number): void {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.tiles[y][x].index === foundationIndex) {
          const r = Math.floor(this.rng() * NUM_COLORS);
          this.setTile(x, y, r); this.addChange(x, y, r);
        }
  }

  createSillyPad(x: number, y: number, playerId: number, startTick: number, numTicks: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const sp = this.sillyPads[y][x];
    if (sp.active && sp.startTick === startTick) return false;
    if (sp.active && sp.ownerId === playerId)    return false;
    sp.active = true; sp.ownerId = playerId; sp.startTick = startTick;
    sp.expiresAtTick = startTick + numTicks;
    return true;
  }

  createWallbreaker(x: number, y: number, currentTick: number, numTicks: number): boolean {
    if (!this.inBounds(x, y)) return false;
    this.wallbreakers.push({ x, y, startTick: currentTick, expiresAtTick: currentTick + numTicks });
    return true;
  }

  private bfsAlgo(x: number, y: number, baseX: number, baseY: number, currentTick: number): void {
    const i = this.getIndex(x, y);
    if (i === null || !this.isGarden(i) || this.tempBFSMap[y][x] >= 0) return;
    const dist = Math.abs(baseX - x) + Math.abs(baseY - y);
    this.tempBFSMap[y][x] = dist;
    this.revertGarden[y][x] = { active: true, tick: currentTick + dist * GARDEN_DESTROY_TICKS_PER_TILE };
    this.bfsAlgo(x + 1, y, baseX, baseY, currentTick);
    this.bfsAlgo(x - 1, y, baseX, baseY, currentTick);
    this.bfsAlgo(x, y + 1, baseX, baseY, currentTick);
    this.bfsAlgo(x, y - 1, baseX, baseY, currentTick);
  }

  explodeWall(x: number, y: number, currentTick: number): number {
    if (!this.inBounds(x, y) || !this.isWall(this.tiles[y][x].index)) return 0;
    const destroyed = this.tiles[y][x].index;
    const r = Math.floor(this.rng() * NUM_COLORS);
    this.setTile(x, y, r); this.addChange(x, y, r);
    this.resetBFS();
    this.revertGarden[y][x] = { active: false, tick: 0 };
    this.tempBFSMap[y][x] = 0;
    this.bfsAlgo(x + 1, y, x, y, currentTick);
    this.bfsAlgo(x - 1, y, x, y, currentTick);
    this.bfsAlgo(x, y + 1, x, y, currentTick);
    this.bfsAlgo(x, y - 1, x, y, currentTick);
    return destroyed;
  }

  update(currentTick: number): {
    sillyPadExpired: boolean;
    expiredSillyPads: { x: number; y: number }[];
    tileChange: boolean;
    destroyed: DestroyedTiles;
    explosions: ExplosionEvent[];
  } {
    const expiredSillyPads: { x: number; y: number }[] = [];
    let sillyPadExpired = false, tileChange = false;
    const destroyed: DestroyedTiles = {
      gold:  { walls: 0, gardens: 0 }, pink:  { walls: 0, gardens: 0 },
      white: { walls: 0, gardens: 0 }, black: { walls: 0, gardens: 0 },
    };
    const explosions: ExplosionEvent[] = [];

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y][x];
        if (t.changing && currentTick - t.tileChangeStartTick >= t.tileChangeDurTicks)
          t.changing = false;
        const sp = this.sillyPads[y][x];
        if (sp.active && currentTick >= sp.expiresAtTick) {
          sp.active = false; sillyPadExpired = true; expiredSillyPads.push({ x, y });
        }
      }
    }

    const activeWb: WallbreakerEntry[] = [];
    for (const wb of this.wallbreakers) {
      if (currentTick >= wb.expiresAtTick) {
        const result = this.explodeWall(wb.x, wb.y, currentTick);
        if (result > 0) {
          tileChange = true;
          if      (result === 6)  destroyed.pink.walls++;
          else if (result === 9)  destroyed.gold.walls++;
          else if (result === 12) destroyed.white.walls++;
          else if (result === 15) destroyed.black.walls++;
        }
        explosions.push({ x: wb.x, y: wb.y });
      } else {
        activeWb.push(wb);
      }
    }
    this.wallbreakers = activeWb;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const rv = this.revertGarden[y][x];
        if (rv.active && currentTick >= rv.tick) {
          const ti = this.tiles[y][x].index;
          if      (ti === 7)  destroyed.pink.gardens++;
          else if (ti === 10) destroyed.gold.gardens++;
          else if (ti === 13) destroyed.white.gardens++;
          else if (ti === 16) destroyed.black.gardens++;
          const r = Math.floor(this.rng() * NUM_COLORS);
          this.setTile(x, y, r); this.addChange(x, y, r);
          tileChange = true; rv.active = false;
        }
      }
    }
    return { sillyPadExpired, expiredSillyPads, tileChange, destroyed, explosions };
  }

  toSnapshot(): { cols: number; rows: number; tiles: SnapshotTile[][] } {
    return {
      cols: this.cols, rows: this.rows,
      tiles: this.tiles.map(row => row.map(t => ({
        index: t.index, changing: t.changing,
        tileChangeStartTick: t.tileChangeStartTick,
        tileChangeDurTicks:  t.tileChangeDurTicks,
      }))),
    };
  }

  computeChecksum(): number {
    let h = 2166136261 >>> 0;
    h = mix(h, this.cols); h = mix(h, this.rows);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y][x];
        h = mix(h, t.index);
        h = mix(h, t.changing ? 1 : 0);
        h = mix(h, t.tileChangeStartTick >>> 0);
        h = mix(h, t.tileChangeDurTicks  >>> 0);
        const sp = this.sillyPads[y][x];
        h = mix(h, sp.active ? 1 : 0);
        h = mix(h, sp.ownerId >>> 0);
        h = mix(h, sp.expiresAtTick >>> 0);
      }
    }
    h = mix(h, this.wallbreakers.length);
    for (const wb of this.wallbreakers) {
      h = mix(h, wb.x >>> 0); h = mix(h, wb.y >>> 0);
      h = mix(h, wb.startTick >>> 0); h = mix(h, wb.expiresAtTick >>> 0);
    }
    return h >>> 0;
  }
}

function mix(h: number, v: number): number {
  return (((h ^ (v >>> 0)) + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0);
}

// ── LocalPlayerState ──────────────────────────────────────────────────────────
interface LocalPlayerState {
  id: number; name: string; connected: boolean;
  x: number; y: number; facing: DirType;
  intentDir: DirType | null;
  moving: boolean; fromX: number; fromY: number; toX: number; toY: number;
  moveStartTick: number; moveDurTicks: number;
  mode: BotonoidMode;
  numColorChangesLeft: number; numWallsLeft: number;
  cooldownStartTick: number; cooldownDurTicks: number;
  score: number; selectedItem: ItemType;
  numWallbreakersLeft: number; numSillyPadsLeft: number;
  foundationIndex: number; wallIndex: number; gardenIndex: number;
  ready: boolean; selectedRole: Role; selectedModel: Model;
  resultsRole: Role; resultsDismissed: boolean;
  actionPressed: boolean;
  isHuman: boolean; difficulty: BotDifficulty;
}

function setSpecialTiles(p: LocalPlayerState): void {
  switch (p.selectedRole) {
    case 'goldBot':  p.foundationIndex = 8;  p.wallIndex = 9;  p.gardenIndex = 10; break;
    case 'pinkBot':  p.foundationIndex = 5;  p.wallIndex = 6;  p.gardenIndex = 7;  break;
    case 'whiteBot': p.foundationIndex = 11; p.wallIndex = 12; p.gardenIndex = 13; break;
    case 'blackBot': p.foundationIndex = 14; p.wallIndex = 15; p.gardenIndex = 16; break;
  }
}

function resetPlayerData(p: LocalPlayerState): void {
  p.intentDir = null; p.actionPressed = false;
  p.moving = false;
  p.fromX = p.x; p.fromY = p.y; p.toX = p.x; p.toY = p.y;
  p.moveStartTick = 0; p.moveDurTicks = MOVE_TICKS;
  p.facing = 'down'; p.mode = 'walking';
  p.numColorChangesLeft = 0; p.numWallsLeft = 0;
  p.cooldownStartTick = 0; p.cooldownDurTicks = 0;
  p.numSillyPadsLeft = DEFAULT_SILLY_PADS;
  p.numWallbreakersLeft = DEFAULT_WALLBREAKERS;
  p.score = 0; p.selectedItem = 'itemSillyPad';
}

function getTilePosWhileMoving(p: LocalPlayerState, tick: number): { x: number; y: number } {
  if (!p.moving || p.moveDurTicks === 0 || tick <= p.moveStartTick) return { x: p.x, y: p.y };
  const elapsed = tick - p.moveStartTick;
  return elapsed * 2 < p.moveDurTicks ? { x: p.x, y: p.y } : { x: p.toX, y: p.toY };
}

// ── QueuedCommand ─────────────────────────────────────────────────────────────
type QueuedCmd = { playerId: number; cmd: Command };

// ── Snapshot lite (mirrors Go's PlayerSnapshotLite) ───────────────────────────
type SnapLite = {
  id: number; connected: boolean; x: number; y: number; facing: DirType; role: Role; model: Model;
  moving: boolean; fromX: number; fromY: number; toX: number; toY: number;
  moveStartTick: number; moveDurTicks: number; mode: BotonoidMode;
  numColorChangesLeft: number; numWallsLeft: number;
  cooldownStartTick: number; cooldownDurTicks: number;
  score: number; selectedItem: ItemType; numWallbreakersLeft: number; numSillyPadsLeft: number;
};

function toSnapLite(p: LocalPlayerState): SnapLite {
  return {
    id: p.id, connected: p.connected, x: p.x, y: p.y, facing: p.facing,
    role: p.selectedRole, model: p.selectedModel,
    moving: p.moving, fromX: p.fromX, fromY: p.fromY, toX: p.toX, toY: p.toY,
    moveStartTick: p.moveStartTick, moveDurTicks: p.moveDurTicks, mode: p.mode,
    numColorChangesLeft: p.numColorChangesLeft, numWallsLeft: p.numWallsLeft,
    cooldownStartTick: p.cooldownStartTick, cooldownDurTicks: p.cooldownDurTicks,
    score: p.score, selectedItem: p.selectedItem,
    numWallbreakersLeft: p.numWallbreakersLeft, numSillyPadsLeft: p.numSillyPadsLeft,
  };
}

// ── LocalGameServer ───────────────────────────────────────────────────────────
export class LocalGameServer {
  private players: Map<number, LocalPlayerState> = new Map();
  private tileMap!: LocalTileMap;
  private tick = 0;
  private phase: Phase = 'phaseLobby';
  private phaseEndsAtTick = 0;
  private intervalId: number | null = null;
  private cmdQueue: QueuedCmd[] = [];
  private callbacks: LocalServerCallbacks | null = null;
  private prevSnapLites: Map<number, SnapLite> = new Map();
  private configs: OfflinePlayerConfig[];
  private localPlayerId = 1; // player 1's perspective for "hello"

  constructor(configs: OfflinePlayerConfig[]) {
    this.configs = configs;
  }

  start(callbacks: LocalServerCallbacks): void {
    this.callbacks = callbacks;
    this.tick = 0;
    this.phase = 'phaseLobby';
    this.players = new Map();
    const seed = (Date.now() & 0xFFFFFFFF) >>> 0;
    this.tileMap = new LocalTileMap(WORLD_COLS, WORLD_ROWS, seed);

    // Create player state for each config.
    for (const cfg of this.configs) {
      const p: LocalPlayerState = {
        id: cfg.id, name: cfg.name, connected: true,
        x: 1, y: 1, facing: 'down',
        intentDir: null, moving: false,
        fromX: 1, fromY: 1, toX: 1, toY: 1,
        moveStartTick: 0, moveDurTicks: MOVE_TICKS,
        mode: 'walking', numColorChangesLeft: 0, numWallsLeft: 0,
        cooldownStartTick: 0, cooldownDurTicks: 0,
        score: 0, selectedItem: 'itemSillyPad',
        numWallbreakersLeft: DEFAULT_WALLBREAKERS, numSillyPadsLeft: DEFAULT_SILLY_PADS,
        foundationIndex: 5, wallIndex: 6, gardenIndex: 7,
        ready: false, selectedRole: cfg.role, selectedModel: cfg.model,
        resultsRole: cfg.role, resultsDismissed: false, actionPressed: false,
        isHuman: cfg.isHuman, difficulty: cfg.difficulty ?? 'easy',
      };
      setSpecialTiles(p);
      this.players.set(cfg.id, p);
    }

    // Send config/hello/initial snapshots immediately.
    callbacks.onConfig({
      type: 'config',
      tickHz: TICK_HZ,
      moveTicks: MOVE_TICKS,
      moveDurMs: Math.round((MOVE_TICKS / TICK_HZ) * 1000),
      colorCooldownMs: Math.round((COOLDOWN_TICKS / TICK_HZ) * 1000),
      maxTilesColorChange: MAX_COLOR_CHANGES,
      tileSize: 32,
      seed: seed,
      cols: WORLD_COLS,
      rows: WORLD_ROWS,
      configVersion: 1,
    });

    // Send hello for P1 (the local controlling player)
    callbacks.onHello({ type: 'hello', playerId: this.localPlayerId });

    this.broadcastMetaSnapshot();
    this.broadcastStatusSnapshot();
    this.broadcastPlayerSnapshot();
    this.broadcastTileMapSnapshot();

    // All players are pre-configured — mark them ready and start immediately
    // after the callbacks have had a chance to set up the client side.
    setTimeout(() => this.kickoffCountdown(), 100);

    const tickMs = 1000 / TICK_HZ;
    this.intervalId = window.setInterval(() => this.doTick(), tickMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.callbacks = null;
  }

  sendCommand(playerId: number, cmd: Command): void {
    this.cmdQueue.push({ playerId, cmd });
  }

  // ── kick off the countdown immediately ──────────────────────────────────────
  private kickoffCountdown(): void {
    const seed = (Date.now() & 0xFFFFFFFF) >>> 0;
    this.tileMap = new LocalTileMap(WORLD_COLS, WORLD_ROWS, seed);

    // Assign spawn positions.
    const shuffled = [...SPAWN_POSITIONS].sort(() => Math.random() - 0.5);
    let i = 0;
    for (const p of this.players.values()) {
      setSpecialTiles(p);
      resetPlayerData(p);
      p.ready = true;
      const pos = shuffled[i] ?? { x: 1, y: 1 };
      p.x = pos.x; p.y = pos.y;
      p.fromX = pos.x; p.fromY = pos.y;
      p.toX   = pos.x; p.toY   = pos.y;
      i++;
    }

    this.phase = 'phaseCountdown';
    this.phaseEndsAtTick = this.tick + COUNTDOWN_DUR_TICKS;
    this.prevSnapLites.clear();

    // Send fresh tile map + full snapshot so the client has the new board.
    this.broadcastTileMapSnapshot();
    this.broadcastPlayerSnapshot();
    this.broadcastStatusSnapshot();
  }

  // ── main tick ───────────────────────────────────────────────────────────────
  private doTick(): void {
    if (!this.callbacks) return;

    // 1) Drain commands
    const cmds = this.cmdQueue.splice(0);
    for (const qc of cmds) this.applyCmd(qc);

    // 2) AI for computer players (simple random walk - can be improved later)
    if (this.phase === 'phasePlaying') {
      for (const p of this.players.values()) {
        if (!p.isHuman) this.updateBotIntent(p);
      }
    }

    // 3) Advance moves
    if (this.phase === 'phasePlaying') {
      let wasGardenBuilt = false;
      for (const p of this.players.values()) {
        if (!p.moving) {
          if (p.mode === 'wallBuilding' && !wasGardenBuilt) {
            wasGardenBuilt = this.checkForWallBuild(p);
          }
          continue;
        }
        if (this.tick - p.moveStartTick >= p.moveDurTicks) {
          p.x = p.toX; p.y = p.toY;
          p.moving = false; p.fromX = p.x; p.fromY = p.y; p.toX = p.x; p.toY = p.y;

          if (p.mode === 'colorChanging') {
            const result = this.tileMap.checkColorChangeResult(p.x, p.y);
            if (result === 'ok') {
              const toIndex = this.tileMap.getIndexAfterColorChange(p.x, p.y);
              if (toIndex !== null) {
                const comboLen = this.tileMap.initiateColorChange(p.x, p.y, toIndex, this.tick, COLOR_CHANGE_TICKS);
                if (comboLen >= MINIMUM_COMBO) {
                  // Award items
                  if (comboLen >= 8  && comboLen <= 9)  p.numSillyPadsLeft  += 4;
                  else if (comboLen >= 10 && comboLen <= 11) p.numWallbreakersLeft += 1;
                  else if (comboLen >= 12) { p.numSillyPadsLeft += 4; p.numWallbreakersLeft += 2; }
                  p.numColorChangesLeft--;
                  this.tileMap.initiateCombo(p.foundationIndex);
                  p.mode = 'wallBuilding';
                  p.numWallsLeft = comboLen - 3;
                  this.broadcastPendingTiles();
                } else {
                  p.numColorChangesLeft--;
                  if (p.numColorChangesLeft <= 0) this.enterCooldown(p);
                  this.callbacks!.onTileInitiateChange({
                    type: 'tileInitiateChange', x: p.x, y: p.y,
                    toIndex, tileChangeStartTick: this.tick, tileChangeDurTicks: COLOR_CHANGE_TICKS,
                  });
                }
              }
            } else if (result === 'failDecrement') {
              p.numColorChangesLeft--;
              if (p.numColorChangesLeft <= 0) this.enterCooldown(p);
            }
          } else if (p.mode === 'wallBuilding') {
            wasGardenBuilt = this.checkForWallBuild(p) || wasGardenBuilt;
          }
        }
      }

      // After garden-build: clear orphaned foundations
      if (wasGardenBuilt) {
        for (const p of this.players.values()) {
          if (p.numWallsLeft > 0 && this.tileMap.countTilesOfIndex(p.foundationIndex) === 0) {
            p.numWallsLeft = 0;
            if (p.numColorChangesLeft > 0) p.mode = 'colorChanging';
            else this.enterCooldown(p);
          }
        }
      }

      // 4) Start moves from intentDir
      for (const p of this.players.values()) {
        if (p.moving || !p.intentDir) continue;
        const dir = p.intentDir;
        p.facing = dir;
        let nx = p.x, ny = p.y;
        if      (dir === 'up')    ny--;
        else if (dir === 'down')  ny++;
        else if (dir === 'left')  nx--;
        else if (dir === 'right') nx++;
        if (!this.tileMap.checkMovement(nx, ny, p.id, p.wallIndex, p.mode === 'ghost')) continue;
        p.moving = true; p.fromX = p.x; p.fromY = p.y; p.toX = nx; p.toY = ny;
        p.moveStartTick = this.tick; p.moveDurTicks = MOVE_TICKS;
      }
    }

    // 5) Update tile map (silly pads, wallbreakers, garden revert)
    const { sillyPadExpired, expiredSillyPads, tileChange, destroyed, explosions } =
      this.tileMap.update(this.tick);

    if (sillyPadExpired) {
      for (const sp of expiredSillyPads) {
        this.callbacks!.onSillyPadMsg({ type: 'sillyPadMsg', action: 'remove', x: sp.x, y: sp.y, ownerId: -1, expiresAtTick: 0 });
      }
    }
    if (tileChange) this.broadcastPendingTiles();

    if (this.phase === 'phasePlaying') {
      for (const p of this.players.values()) p.score += 0; // score from destroyed tiles
      // Subtract score for destroyed tiles
      for (const p of this.players.values()) {
        switch (p.selectedRole) {
          case 'pinkBot':  p.score -= destroyed.pink.walls  * POINTS_PER_WALL + destroyed.pink.gardens  * POINTS_PER_GARDEN; break;
          case 'goldBot':  p.score -= destroyed.gold.walls  * POINTS_PER_WALL + destroyed.gold.gardens  * POINTS_PER_GARDEN; break;
          case 'whiteBot': p.score -= destroyed.white.walls * POINTS_PER_WALL + destroyed.white.gardens * POINTS_PER_GARDEN; break;
          case 'blackBot': p.score -= destroyed.black.walls * POINTS_PER_WALL + destroyed.black.gardens * POINTS_PER_GARDEN; break;
        }
      }
      // Explosions → ghost nearby players
      let resetFoundations = false;
      for (const exp of explosions) {
        for (const p of this.players.values()) {
          const dist = Math.abs(exp.x - p.x) + Math.abs(exp.y - p.y);
          if (dist <= EXPLOSION_RADIUS && p.mode !== 'ghost') {
            this.tileMap.resetFoundationTiles(p.foundationIndex);
            p.mode = 'ghost'; p.numColorChangesLeft = 0; p.numWallsLeft = 0;
            p.cooldownStartTick = this.tick; p.cooldownDurTicks = GHOST_TICKS;
            resetFoundations = true;
          }
        }
      }
      if (resetFoundations) this.broadcastPendingTiles();
    }

    // 6) Player cooldown/ghost update
    for (const p of this.players.values()) {
      if ((p.mode === 'cooldown' || p.mode === 'ghost') &&
          this.tick - p.cooldownStartTick >= p.cooldownDurTicks) {
        p.mode = 'walking';
      }
    }

    // 7) Phase transitions
    const prevPhase = this.phase;
    this.updatePhase();
    const phaseChanged = this.phase !== prevPhase;
    if (phaseChanged) {
      this.broadcastTileMapSnapshot();
    }

    // 8) Broadcast player state
    if (this.tick % TICK_HZ === 0) this.broadcastPlayerSnapshot();
    this.broadcastPlayerDelta();

    if (this.phase !== 'phasePlaying' && this.tick % 4 === 0) this.broadcastStatusSnapshot();

    this.tick++;
  }

  // ── phase management ─────────────────────────────────────────────────────────
  private updatePhase(): void {
    switch (this.phase) {
      case 'phaseCountdown':
        if (this.tick >= this.phaseEndsAtTick) {
          this.phase = 'phasePlaying';
          this.phaseEndsAtTick = this.tick + GAME_DUR_TICKS;
        }
        break;
      case 'phasePlaying':
        if (this.tick >= this.phaseEndsAtTick) {
          this.enterResults();
        }
        break;
      case 'phaseFinished':
        // In offline mode, we don't auto-return to lobby — the UI handles it.
        break;
    }
  }

  private enterResults(): void {
    this.phase = 'phaseFinished';
    this.phaseEndsAtTick = 0;
    for (const p of this.players.values()) {
      p.resultsRole = p.selectedRole;
      p.resultsDismissed = false;
      p.intentDir = null; p.actionPressed = false;
      p.moving = false; p.fromX = p.x; p.fromY = p.y; p.toX = p.x; p.toY = p.y;
      p.ready = false;
    }
  }

  // ── command application (port of player.go applyQueuedCmdToRoom) ─────────────
  private applyCmd(qc: QueuedCmd): void {
    const p = this.players.get(qc.playerId);
    if (!p) return;
    const cmd = qc.cmd;

    if (this.phase !== 'phasePlaying') {
      if (cmd.type === 'resultsOk' && this.phase === 'phaseFinished') {
        p.resultsDismissed = true;
        this.broadcastStatusSnapshot();
      }
      if (cmd.type === 'cancelCountdown' && this.phase === 'phaseCountdown') {
        // Not applicable in offline mode (no lobby), ignore.
      }
      return;
    }

    switch (cmd.type) {
      case 'input': {
        p.intentDir = cmd.dir ?? null;
        if (cmd.dir && !p.moving) p.facing = cmd.dir;
        break;
      }
      case 'action':
      case 'actionDown': {
        if (p.mode === 'walking') {
          p.mode = 'colorChanging';
          p.numColorChangesLeft = MAX_COLOR_CHANGES;
        } else if (p.mode === 'wallBuilding') {
          p.actionPressed = true;
        }
        break;
      }
      case 'actionUp': {
        p.actionPressed = false;
        break;
      }
      case 'changeItem': {
        if      (p.selectedItem === 'itemSillyPad')    p.selectedItem = 'itemWallbreaker';
        else if (p.selectedItem === 'itemWallbreaker') p.selectedItem = 'itemGhost';
        else                                           p.selectedItem = 'itemSillyPad';
        break;
      }
      case 'useItem': {
        if (p.mode === 'ghost') break;
        if (p.selectedItem === 'itemSillyPad' && p.numSillyPadsLeft > 0) {
          const { x, y } = getTilePosWhileMoving(p, this.tick);
          if (this.tileMap.createSillyPad(x, y, p.id, this.tick, SILLY_PAD_TICKS)) {
            p.numSillyPadsLeft--;
            this.callbacks!.onSillyPadMsg({
              type: 'sillyPadMsg', action: 'create', x, y, ownerId: p.id,
              expiresAtTick: this.tick + SILLY_PAD_TICKS,
            });
          }
        } else if (p.selectedItem === 'itemWallbreaker' && p.numWallbreakersLeft > 0 && !p.moving) {
          let nx = p.x, ny = p.y;
          if      (p.facing === 'up')    ny--;
          else if (p.facing === 'down')  ny++;
          else if (p.facing === 'left')  nx--;
          else if (p.facing === 'right') nx++;
          if (this.tileMap.createWallbreaker(nx, ny, this.tick, WALLBREAKER_TICKS)) {
            p.numWallbreakersLeft--;
            this.callbacks!.onWallbreakerMsg({
              type: 'wallbreakerMsg', action: 'create', x: nx, y: ny,
              startTick: this.tick, expiresAtTick: this.tick + WALLBREAKER_TICKS,
            });
          }
        } else if (p.selectedItem === 'itemGhost' && p.mode !== 'ghost') {
          this.tileMap.resetFoundationTiles(p.foundationIndex);
          p.mode = 'ghost'; p.numColorChangesLeft = 0; p.numWallsLeft = 0;
          p.cooldownStartTick = this.tick; p.cooldownDurTicks = GHOST_TICKS;
          this.broadcastPendingTiles();
        }
        break;
      }
    }
  }

  // ── wall-build check (port of CheckForWallBuild in gameloop.go) ──────────────
  private checkForWallBuild(p: LocalPlayerState): boolean {
    if (!p.actionPressed) return false;
    const built = this.tileMap.tryBuildWall(p.x, p.y, p.foundationIndex, p.wallIndex);
    if (!built) return false;
    p.numWallsLeft--;
    p.score += POINTS_PER_WALL;
    const { madeGarden, numFoundationsDestroyed, numGardensBuilt } =
      this.tileMap.checkForGarden(p.x, p.y, p.foundationIndex, p.wallIndex, p.gardenIndex);
    if (madeGarden) {
      p.numWallsLeft -= numFoundationsDestroyed;
      p.score += numGardensBuilt * POINTS_PER_GARDEN;
    }
    if (p.numWallsLeft <= 0) {
      this.tileMap.resetFoundationTiles(p.foundationIndex);
      if (p.numColorChangesLeft > 0) p.mode = 'colorChanging';
      else this.enterCooldown(p);
    }
    this.broadcastPendingTiles();
    return madeGarden;
  }

  private enterCooldown(p: LocalPlayerState): void {
    p.mode = 'cooldown';
    p.cooldownStartTick = this.tick;
    p.cooldownDurTicks  = COOLDOWN_TICKS;
  }

  // ── computer-player AI (simple: random walk, easy sits still) ───────────────
  private updateBotIntent(p: LocalPlayerState): void {
    // Easy bots sit still for now.
    if (p.difficulty === 'easy') { p.intentDir = null; return; }
    // Normal/Hard: random movement with low probability of changing direction.
    if (Math.random() < 0.05) {
      const dirs: DirType[] = ['up', 'down', 'left', 'right'];
      p.intentDir = dirs[Math.floor(Math.random() * dirs.length)];
    }
  }

  // ── broadcast helpers ────────────────────────────────────────────────────────
  private broadcast<T>(fn: (cb: LocalServerCallbacks) => void): void {
    if (this.callbacks) fn(this.callbacks);
  }

  private broadcastPendingTiles(): void {
    const changes = this.tileMap.pendingChanges();
    if (changes.length === 0) return;
    this.broadcast(cb => cb.onTileChangeList({ type: 'tileChangeList', tileChangeList: changes }));
    this.tileMap.resetChangeMap();
  }

  private buildSnapshotPlayers(): PlayerSnapshotMsg['players'] {
    return Array.from(this.players.values()).map(p => ({
      phase: this.phase,
      id: p.id, name: p.name, connected: p.connected,
      x: p.x, y: p.y, facing: p.facing,
      moving: p.moving, fromX: p.fromX, fromY: p.fromY, toX: p.toX, toY: p.toY,
      moveStartTick: p.moveStartTick, moveDurTicks: p.moveDurTicks,
      mode: p.mode, numColorChangesLeft: p.numColorChangesLeft, numWallsLeft: p.numWallsLeft,
      cooldownStartTick: p.cooldownStartTick, cooldownDurTicks: p.cooldownDurTicks,
      score: p.score, selectedItem: p.selectedItem,
      numWallbreakersLeft: p.numWallbreakersLeft, numSillyPadsLeft: p.numSillyPadsLeft,
      role: p.selectedRole, model: p.selectedModel,
      ready: p.ready, resultsRole: p.resultsRole, resultsDismissed: p.resultsDismissed,
    }));
  }

  private broadcastPlayerSnapshot(): void {
    this.broadcast(cb => cb.onPlayerSnapshot({
      type: 'playerSnapshot', tick: this.tick, phase: this.phase,
      phaseEndsAtTick: this.phaseEndsAtTick,
      mapChecksum: this.tileMap.computeChecksum(),
      players: this.buildSnapshotPlayers(),
    }));
  }

  private broadcastPlayerDelta(): void {
    const deltas: PlayerDeltaMsg['deltas'] = [];
    for (const p of this.players.values()) {
      const now = toSnapLite(p);
      const prev = this.prevSnapLites.get(p.id);
      if (!prev) {
        // First sight: send full state as delta.
        deltas.push({
          id: now.id, connected: now.connected, x: now.x, y: now.y, facing: now.facing,
          role: now.role, model: now.model,
          moving: now.moving, fromX: now.fromX, fromY: now.fromY, toX: now.toX, toY: now.toY,
          moveStartTick: now.moveStartTick, moveDurTicks: now.moveDurTicks, mode: now.mode,
          numColorChangesLeft: now.numColorChangesLeft, numWallsLeft: now.numWallsLeft,
          cooldownStartTick: now.cooldownStartTick, cooldownDurTicks: now.cooldownDurTicks,
          score: now.score, selectedItem: now.selectedItem,
          numWallbreakersLeft: now.numWallbreakersLeft, numSillyPadsLeft: now.numSillyPadsLeft,
        });
      } else {
        const d: PlayerDeltaMsg['deltas'][number] = { id: now.id };
        let any = false;
        // Only send changed fields.
        const diff = <K extends keyof SnapLite>(k: K) => {
          if (prev[k] !== now[k]) { (d as any)[k] = now[k]; any = true; }
        };
        (['connected','x','y','facing','role','model','moving','fromX','fromY','toX','toY',
          'moveStartTick','moveDurTicks','mode','numColorChangesLeft','numWallsLeft',
          'cooldownStartTick','cooldownDurTicks','score','selectedItem',
          'numWallbreakersLeft','numSillyPadsLeft'] as (keyof SnapLite)[]).forEach(k => diff(k));
        if (any) deltas.push(d);
      }
      this.prevSnapLites.set(p.id, now);
    }
    if (deltas.length === 0) return;
    this.broadcast(cb => cb.onPlayerDelta({
      type: 'playerDelta', tick: this.tick, phase: this.phase,
      phaseEndsAtTick: this.phaseEndsAtTick,
      mapChecksum: this.tileMap.computeChecksum(),
      deltas,
    }));
  }

  private broadcastMetaSnapshot(): void {
    this.broadcast(cb => cb.onPlayerMetaSnapshot({
      type: 'playerMetaSnapshot',
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, role: p.selectedRole, model: p.selectedModel,
      })),
    }));
  }

  private broadcastStatusSnapshot(): void {
    this.broadcast(cb => cb.onPlayerStatusSnapshot({
      type: 'playerStatusSnapshot',
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, ready: p.ready, resultsRole: p.resultsRole, resultsDismissed: p.resultsDismissed,
      })),
    }));
  }

  private broadcastTileMapSnapshot(): void {
    this.broadcast(cb => cb.onTileMapSnapshot({
      type: 'tileMapSnapshot', tick: this.tick, phase: this.phase,
      tileMap: this.tileMap.toSnapshot(),
    }));
  }
}
