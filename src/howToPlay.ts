import { resources } from "./Resources";
import { NUMBER_OF_COLORS } from "./Constants";
import { frameForBot, BOT_SHEET } from "./botonoidSheet";
import type { ControlsState } from "./optionsOverlay";
import { ItemNotifications } from "./itemNotification";

// ─── Tile indices (matching server: tilemap.go) ───
// 0–4 = color tiles
// Pink: foundation=5, wall=6, garden=7
// Gold: foundation=8, wall=9, garden=10
// Black: foundation=11, wall=12, garden=13
// White: foundation=14, wall=15, garden=16
const PINK_WALL = 6;
const PINK_GARDEN = 7;
const FOUNDATION = 8;
const WALL = 9;
const GARDEN = 10;
const MIN_COMBO = 6;
const MAX_COLOR_CHANGES = 5;
const GHOST_DUR_MS = 40000;
const WALLBREAKER_DUR_MS = 3000;
const EXPLOSION_DUR_MS = 600;
const GOLD_SILLY_PAD_FRAME = 1; // frame 1 in sillyPads.png = goldBot (roleRank order: pink=0, gold=1)

// ─── Timing from constants.go ───
// TickHz=20, MoveTicks=6 → 300ms, ColorChangeTicks=35 → 1750ms, CooldownTicks=45 → 2250ms
const MOVE_DURATION_MS = 300;
const COLOR_CHANGE_FADE_MS = 1750;
const COOLDOWN_MS = 2250;

// ─── Demo grid config ───
const COLS = 10;
const ROWS = 10;
const TILE_PX = 32;
const TILE_FRAME_SIZE = 32;

type Dir = "up" | "down" | "left" | "right";
type Mode = "walking" | "colorChanging" | "wallBuilding" | "cooldown";

type MoveAnim = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startMs: number;
  durMs: number;
};

type TileChange = {
  prevIndex: number;
  startMs: number;
  durMs: number;
};

type DemoState = {
  tiles: number[][];
  tileChanges: (TileChange | null)[][];
  px: number;
  py: number;
  facing: Dir;
  mode: Mode;
  colorChangesLeft: number;
  wallsLeft: number;
  score: number;
  moveAnim: MoveAnim | null;
  cooldownStartMs: number;
  cooldownDurMs: number;
  itemCardVisible: boolean;
  selectedItemIdx: number;
  itemCounts: [number, number, number];
  itemSwitchTimer: number;
  sillyPads: Set<string>;
  // Pink bot (Items page only)
  showPinkBot: boolean;
  pinkPx: number;
  pinkPy: number;
  pinkFacing: Dir;
  pinkCurrentDir: Dir;
  pinkMoveAnim: MoveAnim | null;
  pinkGhost: boolean;
  pinkGhostEndMs: number;
  pinkNextDirMs: number;
  // Wallbreakers and explosions
  demoWallbreakers: { r: number; c: number; placedMs: number; durMs: number }[];
  demoExplosions: { r: number; c: number; startMs: number; durMs: number }[];
  // Gold bot ghost state
  goldGhost: boolean;
  goldGhostEndMs: number;
};

// ─── Key display helper ───

function keyDisplayName(key: string): string {
  switch (key) {
    case " ": return "Space";
    case "ArrowUp": return "\u2191";
    case "ArrowDown": return "\u2193";
    case "ArrowLeft": return "\u2190";
    case "ArrowRight": return "\u2192";
    case "Shift": return "Shift";
    case "Control": return "Ctrl";
    default:
      if (key.length === 1) return key.toUpperCase();
      return key;
  }
}

function moveKeysLabel(c: ControlsState): string {
  return `${keyDisplayName(c.up)} ${keyDisplayName(c.left)} ${keyDisplayName(c.down)} ${keyDisplayName(c.right)}`;
}

// ─── Page definitions ───

type Page = {
  title: string;
  html: (c: ControlsState) => string;
  hint: (c: ControlsState) => string;
  setup: (demo: DemoState) => void;
};

function makeEmptyTileChanges(): (TileChange | null)[][] {
  const t: (TileChange | null)[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: (TileChange | null)[] = [];
    for (let c = 0; c < COLS; c++) row.push(null);
    t.push(row);
  }
  return t;
}

function makeRandomTiles(): number[][] {
  const t: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) row.push(Math.floor(Math.random() * NUMBER_OF_COLORS));
    t.push(row);
  }
  return t;
}

function makeFilledTiles(index: number): number[][] {
  const t: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) row.push(index);
    t.push(row);
  }
  return t;
}

function resetDemoBase(demo: DemoState) {
  demo.tileChanges = makeEmptyTileChanges();
  demo.moveAnim = null;
  demo.cooldownStartMs = 0;
  demo.cooldownDurMs = 0;
  demo.itemCardVisible = false;
  demo.selectedItemIdx = 0;
  demo.itemCounts = [0, 0, 0];
  demo.itemSwitchTimer = 0;
  demo.sillyPads = new Set();
  demo.showPinkBot = false;
  demo.pinkPx = 2;
  demo.pinkPy = 5;
  demo.pinkFacing = "down";
  demo.pinkCurrentDir = "down";
  demo.pinkMoveAnim = null;
  demo.pinkGhost = false;
  demo.pinkGhostEndMs = 0;
  demo.pinkNextDirMs = 0;
  demo.demoWallbreakers = [];
  demo.demoExplosions = [];
  demo.goldGhost = false;
  demo.goldGhostEndMs = 0;
}

const pages: Page[] = [
  // ─── Page 1: Welcome ───
  {
    title: "Welcome",
    html: (c) => `
      <div class="htp-section">
        <h3>Welcome to Botonoids!</h3>
        <p>You are a robot on a colorful tile grid. Your goal is to <strong>score the most points</strong> before the 9-minute timer runs out.</p>
        <p>Points come from <strong>building walls</strong> (1 pt each) and <strong>creating gardens</strong> (2 pts per tile).</p>
        <p>The cycle is: change tile colors to make combos, build walls on the combo's foundation, and enclose areas to grow gardens.</p>
      </div>
      <div class="htp-section">
        <h3>Controls</h3>
        <div class="htp-controls-grid">
          <span class="htp-key">${moveKeysLabel(c)}</span><span>Move your robot</span>
          <span class="htp-key">${keyDisplayName(c.action)}</span><span>Action (enter color-change mode / build walls)</span>
          <span class="htp-key">${keyDisplayName(c.changeItem)}</span><span>Switch item</span>
          <span class="htp-key">${keyDisplayName(c.useItem)}</span><span>Use item</span>
        </div>
      </div>
    `,
    hint: (c) => `Use ${moveKeysLabel(c)} to walk around!`,
    setup(demo) {
      demo.tiles = makeRandomTiles();
      demo.px = 4; demo.py = 4;
      demo.mode = "walking";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 0;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },

  // ─── Page 2: Color Changing ───
  {
    title: "Color Changing",
    html: (c) => `
      <div class="htp-section">
        <h3>Changing Tile Colors</h3>
        <p>Press <span class="htp-key">${keyDisplayName(c.action)}</span> to enter <strong>color-changing mode</strong>. A number appears above your robot showing how many changes you have (5).</p>
        <p>While in this mode, each tile you walk onto cycles to the next color:</p>
        <div class="htp-tile-order"><canvas id="htp-tile-order-canvas" width="320" height="36"></canvas></div>
        <p>After all 5 changes are used, there's a short cooldown before you can activate it again.</p>
      </div>
      <div class="htp-section">
        <h3>Try it!</h3>
        <p>Press <span class="htp-key">${keyDisplayName(c.action)}</span> to start painting, then walk around.</p>
      </div>
    `,
    hint: (c) => `Press ${keyDisplayName(c.action)}, then move to change tile colors!`,
    setup(demo) {
      demo.tiles = makeRandomTiles();
      demo.px = 4; demo.py = 4;
      demo.mode = "walking";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 0;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },

  // ─── Page 3: Combos ───
  {
    title: "Combos",
    html: (c) => `
      <div class="htp-section">
        <h3>Making Combos</h3>
        <p>When <strong>6 or more adjacent tiles</strong> of the same color are connected, they form a <strong>combo!</strong></p>
        <p>All combo tiles instantly turn into <strong>foundation</strong> (darker tiles), and you enter wall-building mode.</p>
      </div>
      <div class="htp-section">
        <h3>Try it!</h3>
        <p>The tiles are almost all the same color. Press <span class="htp-key">${keyDisplayName(c.action)}</span> and change the odd ones to match — then watch the combo happen!</p>
      </div>
    `,
    hint: (c) => `Press ${keyDisplayName(c.action)}, then change mismatched tiles to trigger a combo!`,
    setup(demo) {
      demo.tiles = makeFilledTiles(0);
      demo.tiles[3][3] = 1;
      demo.tiles[4][5] = 2;
      demo.tiles[5][4] = 3;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (r < 2 || r > 7 || c < 2 || c > 7) {
            demo.tiles[r][c] = Math.floor(Math.random() * NUMBER_OF_COLORS);
          }
        }
      }
      demo.px = 3; demo.py = 2;
      demo.mode = "walking";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 0;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },

  // ─── Page 4: Building Walls ───
  {
    title: "Building Walls",
    html: (c) => `
      <div class="htp-section">
        <h3>Building Walls</h3>
        <p>After a combo, you enter <strong>wall-building mode</strong>. A number on your robot's body shows how many walls you can build.</p>
        <p>You get <strong>combo size - 3</strong> walls. Stand on a foundation tile and press <span class="htp-key">${keyDisplayName(c.action)}</span> to build a wall. Each wall is worth <strong>1 point</strong>.</p>
        <p>Once you run out of walls, remaining foundation tiles turn back into regular colored tiles.</p>
      </div>
      <div class="htp-section">
        <h3>Try it!</h3>
        <p>You're in wall-building mode with 10 walls. Walk onto the darker foundation tiles and press <span class="htp-key">${keyDisplayName(c.action)}</span> to build walls!</p>
      </div>
    `,
    hint: (c) => `Walk onto dark foundation tiles and press ${keyDisplayName(c.action)} to build walls!`,
    setup(demo) {
      demo.tiles = makeRandomTiles();
      for (let r = 2; r <= 7; r++) {
        for (let c = 2; c <= 7; c++) {
          demo.tiles[r][c] = FOUNDATION;
        }
      }
      demo.px = 2; demo.py = 2;
      demo.mode = "wallBuilding";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 10;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },

  // ─── Page 5: Gardens & Enclosing ───
  {
    title: "Gardens",
    html: (_c) => `
      <div class="htp-section">
        <h3>Enclosing Areas</h3>
        <p>If your walls <strong>enclose an area</strong> (using walls + map edges), every tile inside the enclosure becomes a <strong>garden</strong>, worth <strong>2 points each!</strong></p>
        <p>When a garden forms, any foundation tiles inside are consumed. The number of consumed foundations is deducted from your remaining walls.</p>
        <p>Gardens are the main way to score big. Plan your combos and wall placement to enclose the largest areas possible.</p>
      </div>
      <div class="htp-section">
        <h3>Try it!</h3>
        <p>Some walls are already placed. Build the remaining walls to close the gap and create a garden!</p>
      </div>
    `,
    hint: () => `Build walls to close the gap and create a garden!`,
    setup(demo) {
      demo.tiles = makeRandomTiles();
      for (let c = 2; c <= 7; c++) demo.tiles[2][c] = WALL;
      for (let c = 2; c <= 7; c++) demo.tiles[7][c] = WALL;
      for (let r = 3; r <= 6; r++) demo.tiles[r][2] = WALL;
      demo.tiles[3][7] = WALL;
      demo.tiles[6][7] = WALL;
      demo.tiles[4][7] = FOUNDATION;
      demo.tiles[5][7] = FOUNDATION;

      demo.px = 4; demo.py = 6;
      demo.mode = "wallBuilding";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 2;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },

  // ─── Page 6: Items ───
  {
    title: "Items",
    html: (c) => `
      <div class="htp-section">
        <h3>Items</h3>
        <p>You earn items from large combos. Press <span class="htp-key">${keyDisplayName(c.changeItem)}</span> to switch between items and <span class="htp-key">${keyDisplayName(c.useItem)}</span> to use them.</p>
        <div class="htp-items-list">
          <div class="htp-item-row"><canvas class="htp-item-icon" data-frame="0" width="32" height="32"></canvas><span><strong>Silly Pad</strong> — Place on a tile to block other players from walking on it.</span></div>
          <div class="htp-item-row"><canvas class="htp-item-icon" data-frame="1" width="32" height="32"></canvas><span><strong>Wallbreaker</strong> — Explodes nearby walls and gardens. Great for sabotaging opponents!</span></div>
          <div class="htp-item-row"><canvas class="htp-item-icon" data-frame="2" width="32" height="32"></canvas><span><strong>Ghost</strong> — Walk through walls temporarily. Useful for escaping or sneaking.</span></div>
        </div>
      </div>
      <div class="htp-section">
        <h3>Item Rewards from Combos</h3>
        <p><strong>8-9 tiles:</strong> +4 silly pads<br/>
        <strong>10-11 tiles:</strong> +1 wallbreaker<br/>
        <strong>12+ tiles:</strong> +4 silly pads and +2 wallbreakers</p>
      </div>
    `,
    hint: (c) => `${keyDisplayName(c.changeItem)} to switch item · ${keyDisplayName(c.useItem)} to use it`,
    setup(demo) {
      demo.tiles = makeRandomTiles();
      // Pink 2x2 garden enclosed by pink walls (upper-right corner)
      // Ring of pink walls around rows 2-3, cols 7-8
      for (let c = 6; c <= 9; c++) demo.tiles[1][c] = PINK_WALL; // top
      for (let c = 6; c <= 9; c++) demo.tiles[4][c] = PINK_WALL; // bottom
      demo.tiles[2][6] = PINK_WALL; demo.tiles[3][6] = PINK_WALL; // left
      demo.tiles[2][9] = PINK_WALL; demo.tiles[3][9] = PINK_WALL; // right
      demo.tiles[2][7] = PINK_GARDEN; demo.tiles[2][8] = PINK_GARDEN;
      demo.tiles[3][7] = PINK_GARDEN; demo.tiles[3][8] = PINK_GARDEN;

      demo.px = 4; demo.py = 6;
      demo.mode = "walking";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 0;
      demo.score = 0;
      resetDemoBase(demo);
      demo.itemCardVisible = true;
      demo.selectedItemIdx = 0;
      demo.itemCounts = [50, 2, 1];
      // Pink bot wanders in the left/center area
      demo.showPinkBot = true;
      demo.pinkPx = 2;
      demo.pinkPy = 7;
      demo.pinkFacing = "right";
      demo.pinkCurrentDir = "right";
    },
  },

  // ─── Page 7: Summary ───
  {
    title: "Summary",
    html: (c) => `
      <div class="htp-section">
        <h3>The Loop</h3>
        <ol class="htp-summary-list">
          <li><strong>Press ${keyDisplayName(c.action)}</strong> to enter color-changing mode (5 changes)</li>
          <li><strong>Walk over tiles</strong> to cycle their colors</li>
          <li><strong>Make a combo</strong> — 6+ same-color adjacent tiles turn into foundation</li>
          <li><strong>Build walls</strong> on foundation tiles (1 point each)</li>
          <li><strong>Enclose areas</strong> with walls to create gardens (2 points per tile)</li>
          <li><strong>Use items</strong> to block opponents or destroy their walls</li>
        </ol>
      </div>
      <div class="htp-section">
        <h3>Winning</h3>
        <p>The player with the <strong>most points</strong> after <strong>9 minutes</strong> wins! Up to 4 players can play at once.</p>
        <p>Good luck out there, robot!</p>
      </div>
    `,
    hint: () => "You're ready! Close this and start playing.",
    setup(demo) {
      demo.tiles = makeRandomTiles();
      demo.px = 4; demo.py = 4;
      demo.mode = "walking";
      demo.colorChangesLeft = 0;
      demo.wallsLeft = 0;
      demo.score = 0;
      resetDemoBase(demo);
    },
  },
];

// ─── Flood fill helper ───

function floodFill(tiles: number[][], startR: number, startC: number, targetColor: number): [number, number][] {
  const visited = new Set<string>();
  const result: [number, number][] = [];
  const stack: [number, number][] = [[startR, startC]];

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    if (tiles[r][c] !== targetColor) continue;
    visited.add(key);
    result.push([r, c]);
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return result;
}

function checkGardenFromWall(tiles: number[][], wallR: number, wallC: number): [number, number][] {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const allGardenTiles = new Map<string, [number, number]>();

  for (const [dr, dc] of dirs) {
    const sr = wallR + dr;
    const sc = wallC + dc;
    if (sr < 0 || sr >= ROWS || sc < 0 || sc >= COLS) continue;
    const idx = tiles[sr][sc];
    if (idx > NUMBER_OF_COLORS - 1 && idx !== FOUNDATION) continue;

    const visited = new Set<string>();
    const gardenable: [number, number][] = [];
    const stack: [number, number][] = [[sr, sc]];
    const edgeHits = new Set<string>();
    let hitEnemyWall = false;

    while (stack.length > 0) {
      const [r, c] = stack.pop()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        if (r < 0) edgeHits.add("top");
        if (r >= ROWS) edgeHits.add("bottom");
        if (c < 0) edgeHits.add("left");
        if (c >= COLS) edgeHits.add("right");
        continue;
      }
      const tileIdx = tiles[r][c];
      if (tileIdx === WALL || tileIdx === GARDEN) continue;
      if (tileIdx > NUMBER_OF_COLORS - 1 && tileIdx !== FOUNDATION) {
        // Enemy walls invalidate the region (can't garden against opponent walls)
        if (tileIdx === PINK_WALL || tileIdx === 12 || tileIdx === 15) hitEnemyWall = true;
        continue;
      }
      visited.add(key);
      gardenable.push([r, c]);
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    if (!hitEnemyWall && edgeHits.size <= 2 && gardenable.length > 0) {
      for (const [r, c] of gardenable) {
        allGardenTiles.set(`${r},${c}`, [r, c]);
      }
    }
  }
  return [...allGardenTiles.values()];
}

function countFoundation(tiles: number[][]): number {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tiles[r][c] === FOUNDATION) n++;
    }
  }
  return n;
}

function cleanUpFoundation(demo: DemoState) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (demo.tiles[r][c] === FOUNDATION) {
        demo.tiles[r][c] = Math.floor(Math.random() * NUMBER_OF_COLORS);
      }
    }
  }
  demo.wallsLeft = 0;
}

// Transition out of wall building: go to colorChanging if changes left, else cooldown
function exitWallBuilding(demo: DemoState, nowMs: number) {
  cleanUpFoundation(demo);
  if (demo.colorChangesLeft > 0) {
    demo.mode = "colorChanging";
  } else {
    enterCooldown(demo, nowMs);
  }
}

function enterCooldown(demo: DemoState, nowMs: number) {
  demo.mode = "cooldown";
  demo.cooldownStartMs = nowMs;
  demo.cooldownDurMs = COOLDOWN_MS;
}

// ─── Controller ───

export type HowToPlayController = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

export function initHowToPlay(args: {
  onOpenChange: (open: boolean) => void;
  getControls: () => ControlsState;
}): HowToPlayController {
  const root = document.getElementById("how-to-play-overlay") as HTMLElement;
  const closeBtn = document.getElementById("htp-close-btn") as HTMLButtonElement;
  const titleEl = document.getElementById("htp-title") as HTMLElement;
  const textArea = document.getElementById("htp-text-area") as HTMLElement;
  const demoHint = document.getElementById("htp-demo-hint") as HTMLElement;
  const demoCanvas = document.getElementById("htp-demo-canvas") as HTMLCanvasElement;
  const prevBtn = document.getElementById("htp-prev-btn") as HTMLButtonElement;
  const nextBtn = document.getElementById("htp-next-btn") as HTMLButtonElement;
  const pageIndicator = document.getElementById("htp-page-indicator") as HTMLElement;

  if (!root || !closeBtn || !titleEl || !textArea || !demoHint || !demoCanvas || !prevBtn || !nextBtn || !pageIndicator) {
    throw new Error("how-to-play DOM missing required elements");
  }

  // Prevent buttons from stealing keyboard focus so space key works as game action
  closeBtn.tabIndex = -1;
  prevBtn.tabIndex = -1;
  nextBtn.tabIndex = -1;

  const ctx = demoCanvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const itemNotifs = new ItemNotifications();

  let isOpenState = false;
  let animFrame = 0;
  let currentPage = 0;

  const demo: DemoState = {
    tiles: [],
    tileChanges: [],
    px: 4,
    py: 4,
    facing: "down",
    mode: "walking",
    colorChangesLeft: 0,
    wallsLeft: 0,
    score: 0,
    moveAnim: null,
    cooldownStartMs: 0,
    cooldownDurMs: 0,
    itemCardVisible: false,
    selectedItemIdx: 0,
    itemCounts: [0, 0, 0],
    itemSwitchTimer: 0,
    sillyPads: new Set(),
    showPinkBot: false,
    pinkPx: 2,
    pinkPy: 5,
    pinkFacing: "down",
    pinkCurrentDir: "down",
    pinkMoveAnim: null,
    pinkGhost: false,
    pinkGhostEndMs: 0,
    pinkNextDirMs: 0,
    demoWallbreakers: [],
    demoExplosions: [],
    goldGhost: false,
    goldGhostEndMs: 0,
  };

  // ─── Key mapping helpers ───

  function normalizeKey(k: string): string {
    if (k === " " || k === "Space") return " ";
    if (k.length === 1) return k.toLowerCase();
    return k;
  }

  // Match either e.key or e.code for the action binding.
  // Space is special: e.key is " " but e.code is "Space".
  function isActionEvent(e: KeyboardEvent): boolean {
    const c = args.getControls();
    const bound = normalizeKey(c.action);
    if (normalizeKey(e.key) === bound) return true;
    // Also match e.code "Space" when action is bound to " "
    if (bound === " " && e.code === "Space") return true;
    return false;
  }

  function isDirEvent(e: KeyboardEvent): Dir | null {
    const c = args.getControls();
    const nk = normalizeKey(e.key);
    if (normalizeKey(c.up) === nk) return "up";
    if (normalizeKey(c.down) === nk) return "down";
    if (normalizeKey(c.left) === nk) return "left";
    if (normalizeKey(c.right) === nk) return "right";
    return null;
  }

  function isChangeItemEvent(e: KeyboardEvent): boolean {
    const c = args.getControls();
    return normalizeKey(e.key) === normalizeKey(c.changeItem);
  }

  function isUseItemEvent(e: KeyboardEvent): boolean {
    const c = args.getControls();
    return normalizeKey(e.key) === normalizeKey(c.useItem);
  }

  function isBoundEvent(e: KeyboardEvent): boolean {
    return isDirEvent(e) !== null || isActionEvent(e) || isChangeItemEvent(e) || isUseItemEvent(e);
  }

  // String-based versions for checking keysPressed/keysDown sets in the game loop
  function isActionKey(key: string): boolean {
    const c = args.getControls();
    return normalizeKey(key) === normalizeKey(c.action);
  }

  function isChangeItemKey(key: string): boolean {
    const c = args.getControls();
    return normalizeKey(key) === normalizeKey(c.changeItem);
  }

  function isUseItemKey(key: string): boolean {
    const c = args.getControls();
    return normalizeKey(key) === normalizeKey(c.useItem);
  }

  // ─── Keyboard (capture phase to beat button focus) ───
  const keysDown = new Set<string>();
  const keysPressed = new Set<string>();
  // Direction stack: most recently pressed direction wins (like KeyboardController.ts)
  let dirStack: Dir[] = [];
  let actionDown = false;

  // Use a canonical key string so space always maps consistently
  function canonicalKey(e: KeyboardEvent): string {
    if (e.code === "Space") return " ";
    return e.key;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!isOpenState) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (isBoundEvent(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const key = canonicalKey(e);
      if (!keysDown.has(key)) {
        keysPressed.add(key);
        const dir = isDirEvent(e);
        if (dir) {
          dirStack = dirStack.filter(d => d !== dir);
          dirStack.push(dir);
        }
        if (isActionEvent(e)) actionDown = true;
      }
      keysDown.add(key);
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!isOpenState) return;
    const key = canonicalKey(e);
    keysDown.delete(key);
    if (isBoundEvent(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const dir = isDirEvent(e);
      if (dir) dirStack = dirStack.filter(d => d !== dir);
      if (isActionEvent(e)) actionDown = false;
    }
  }

  // Use capture: true so we intercept before any other handler
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);

  // ─── Movement with slide animation ───
  // Pending color change to apply when move completes
  let pendingColorChange: { r: number; c: number } | null = null;

  function getDirFromKeys(): Dir | null {
    return dirStack.length > 0 ? dirStack[dirStack.length - 1] : null;
  }

  function isTileChanging(r: number, c: number, nowMs: number): boolean {
    const tc = demo.tileChanges[r]?.[c];
    if (!tc) return false;
    return (nowMs - tc.startMs) < tc.durMs;
  }

  function applyColorChange(r: number, c: number, nowMs: number) {
    const idx = demo.tiles[r][c];
    // If tile is still in transition, deduct a color change but don't change the tile
    if (isTileChanging(r, c, nowMs)) {
      demo.colorChangesLeft--;
      checkColorChangesExhausted(nowMs);
      return;
    }
    if (idx >= 0 && idx < NUMBER_OF_COLORS) {
      const prevIndex = idx;
      demo.tiles[r][c] = (idx + 1) % NUMBER_OF_COLORS;
      demo.tileChanges[r][c] = {
        prevIndex,
        startMs: nowMs,
        durMs: COLOR_CHANGE_FADE_MS,
      };
      demo.colorChangesLeft--;

      // Check for combo
      const newColor = demo.tiles[r][c];
      const group = floodFill(demo.tiles, r, c, newColor);
      if (group.length >= MIN_COMBO) {
        for (const [gr, gc] of group) {
          demo.tiles[gr][gc] = FOUNDATION;
          demo.tileChanges[gr][gc] = null;
        }
        demo.mode = "wallBuilding";
        demo.wallsLeft = group.length - 3;
        // Item rewards based on combo size
        const sz = group.length;
        if (sz >= 8) {
          // Calculate combo center for notification position
          let sumR = 0, sumC = 0;
          for (const [gr, gc] of group) { sumR += gr; sumC += gc; }
          const cx = (sumC / group.length + 0.5) * TILE_PX;
          const cy = (sumR / group.length + 0.5) * TILE_PX;

          if (sz >= 12) {
            demo.itemCounts[0] += 4;
            demo.itemCounts[1] += 2;
            itemNotifs.add(cx - 10, cy, nowMs, 0, "+4");
            itemNotifs.add(cx + 10, cy + 14, nowMs, 1, "+2");
          } else if (sz >= 10) {
            demo.itemCounts[1] += 1;
            itemNotifs.add(cx, cy, nowMs, 1, "+1");
          } else {
            demo.itemCounts[0] += 4;
            itemNotifs.add(cx, cy, nowMs, 0, "+4");
          }
          demo.itemCardVisible = true;
        }
        // Do NOT clear colorChangesLeft here
      }

      checkColorChangesExhausted(nowMs);
    }
  }

  function checkColorChangesExhausted(nowMs: number) {
    if (demo.colorChangesLeft <= 0 && demo.mode === "colorChanging") {
      enterCooldown(demo, nowMs);
    }
  }

  // Overshoot from previous move to carry into the next one (eliminates micro-pauses)
  let moveOvershootMs = 0;

  function tryMove(nowMs: number) {
    if (demo.moveAnim) return;

    const dir = getDirFromKeys();
    if (!dir) return;

    demo.facing = dir;

    const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const nx = demo.px + dx;
    const ny = demo.py + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    if (!demo.goldGhost && isGoldBlockedByWall(demo.tiles[ny][nx])) return;

    // Start time accounts for overshoot so chained moves feel seamless
    const startMs = nowMs - moveOvershootMs;
    moveOvershootMs = 0;

    demo.moveAnim = {
      fromX: demo.px,
      fromY: demo.py,
      toX: nx,
      toY: ny,
      startMs,
      durMs: MOVE_DURATION_MS,
    };

    demo.px = nx;
    demo.py = ny;

    // Queue color change for when the move completes
    if (demo.mode === "colorChanging" && demo.colorChangesLeft > 0) {
      pendingColorChange = { r: ny, c: nx };
    } else {
      pendingColorChange = null;
    }
  }

  function updateMoveAnim(nowMs: number) {
    if (!demo.moveAnim) return;
    const elapsed = nowMs - demo.moveAnim.startMs;
    if (elapsed >= demo.moveAnim.durMs) {
      // Save overshoot so the next move starts seamlessly
      moveOvershootMs = elapsed - demo.moveAnim.durMs;
      demo.moveAnim = null;
      // Apply pending color change on arrival
      if (pendingColorChange && demo.mode === "colorChanging" && demo.colorChangesLeft > 0) {
        applyColorChange(pendingColorChange.r, pendingColorChange.c, nowMs);
        pendingColorChange = null;
      }
      // Auto-build wall on arrival if action key is held during wall building
      if (actionDown && demo.mode === "wallBuilding" && demo.wallsLeft > 0) {
        handleAction(nowMs);
      }
    }
  }

  function updateCooldown(nowMs: number) {
    if (demo.mode !== "cooldown") return;
    if (nowMs - demo.cooldownStartMs >= demo.cooldownDurMs) {
      demo.mode = "walking";
    }
  }

  const BLAST_RADIUS = 2;

  function handleUseItem(nowMs: number) {
    if (!demo.itemCardVisible) return;
    const sel = demo.selectedItemIdx;

    if (sel === 0 && demo.itemCounts[0] > 0) {
      // Silly pad: place on current tile (if not already one there)
      const key = `${demo.py},${demo.px}`;
      if (!demo.sillyPads.has(key)) {
        demo.sillyPads.add(key);
        demo.itemCounts[0]--;
      }
    } else if (sel === 1 && demo.itemCounts[1] > 0) {
      // Wallbreaker: place a timed bomb one tile in front of the player
      const fdx = demo.facing === "left" ? -1 : demo.facing === "right" ? 1 : 0;
      const fdy = demo.facing === "up" ? -1 : demo.facing === "down" ? 1 : 0;
      const tr = demo.py + fdy;
      const tc = demo.px + fdx;
      if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
        const alreadyHere = demo.demoWallbreakers.some(wb => wb.r === tr && wb.c === tc);
        if (!alreadyHere) {
          demo.demoWallbreakers.push({ r: tr, c: tc, placedMs: nowMs, durMs: WALLBREAKER_DUR_MS });
          demo.itemCounts[1]--;
        }
      }
    } else if (sel === 2 && demo.itemCounts[2] > 0 && !demo.goldGhost) {
      // Ghost: activate gold bot ghost mode for 40 seconds
      demo.goldGhost = true;
      demo.goldGhostEndMs = nowMs + GHOST_DUR_MS;
      demo.itemCounts[2]--;
    }
  }

  function handleAction(nowMs: number) {
    if (demo.mode === "walking") {
      demo.mode = "colorChanging";
      demo.colorChangesLeft = MAX_COLOR_CHANGES;
    } else if (demo.mode === "wallBuilding" && demo.wallsLeft > 0) {
      const tile = demo.tiles[demo.py][demo.px];
      if (tile === FOUNDATION) {
        demo.tiles[demo.py][demo.px] = WALL;
        demo.wallsLeft--;
        demo.score += 1;

        const gardenTiles = checkGardenFromWall(demo.tiles, demo.py, demo.px);
        if (gardenTiles.length > 0) {
          let foundationsDestroyed = 0;
          for (const [r, c] of gardenTiles) {
            if (demo.tiles[r][c] === FOUNDATION) foundationsDestroyed++;
            demo.tiles[r][c] = GARDEN;
          }
          demo.score += gardenTiles.length * 2;
          demo.wallsLeft = Math.max(0, demo.wallsLeft - foundationsDestroyed);
        }

        if (demo.wallsLeft <= 0 || countFoundation(demo.tiles) === 0) {
          exitWallBuilding(demo, nowMs);
        }
      }
    }
  }

  // ─── Drawing ───

  function getDrawPos(nowMs: number): { x: number; y: number } {
    if (!demo.moveAnim) {
      return { x: demo.px * TILE_PX, y: demo.py * TILE_PX };
    }
    const elapsed = nowMs - demo.moveAnim.startMs;
    const t = Math.min(1, elapsed / demo.moveAnim.durMs);
    const x = (demo.moveAnim.fromX + (demo.moveAnim.toX - demo.moveAnim.fromX) * t) * TILE_PX;
    const y = (demo.moveAnim.fromY + (demo.moveAnim.toY - demo.moveAnim.fromY) * t) * TILE_PX;
    return { x, y };
  }

  function drawDemo(nowMs: number) {
    ctx.clearRect(0, 0, demoCanvas.width, demoCanvas.height);

    const tilesImg = resources.images.tiles;
    const botsImg = resources.images.bots;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = demo.tiles[r]?.[c] ?? 0;
        const x = c * TILE_PX;
        const y = r * TILE_PX;

        if (tilesImg.isLoaded) {
          // Draw current tile
          ctx.drawImage(
            tilesImg.image,
            0, idx * TILE_FRAME_SIZE, TILE_FRAME_SIZE, TILE_FRAME_SIZE,
            x, y, TILE_PX, TILE_PX
          );

          // Draw fade overlay from previous color if tile is still transitioning
          const tc = demo.tileChanges[r]?.[c];
          if (tc && idx < NUMBER_OF_COLORS) {
            const elapsed = nowMs - tc.startMs;
            if (elapsed < tc.durMs) {
              const fadeAlpha = 1 - (elapsed / tc.durMs);
              ctx.save();
              ctx.globalAlpha = fadeAlpha * fadeAlpha; // quadratic ease
              ctx.drawImage(
                tilesImg.image,
                0, tc.prevIndex * TILE_FRAME_SIZE, TILE_FRAME_SIZE, TILE_FRAME_SIZE,
                x, y, TILE_PX, TILE_PX
              );
              ctx.restore();
            }
          }
        } else {
          const colors = ["#e74c3c", "#e67e22", "#27ae60", "#3498db", "#9b59b6", "#555", "#888", "#3a7d44"];
          ctx.fillStyle = colors[idx] ?? "#333";
          ctx.fillRect(x, y, TILE_PX, TILE_PX);
          ctx.strokeStyle = "#222";
          ctx.strokeRect(x, y, TILE_PX, TILE_PX);
        }
      }
    }

    // Draw silly pads (gold color = frame GOLD_SILLY_PAD_FRAME in sillyPads sprite)
    const sillyPadsImg = resources.images.sillyPads;
    for (const key of demo.sillyPads) {
      const [pr, pc] = key.split(",").map(Number);
      const sx = pc * TILE_PX;
      const sy = pr * TILE_PX;
      if (sillyPadsImg.isLoaded) {
        ctx.drawImage(sillyPadsImg.image, 0, GOLD_SILLY_PAD_FRAME * 32, 32, 32, sx, sy, TILE_PX, TILE_PX);
      } else {
        ctx.fillStyle = "rgba(255,207,0,0.7)";
        ctx.fillRect(sx + 4, sy + 4, TILE_PX - 8, TILE_PX - 8);
      }
    }

    // Draw wallbreakers and pink bot (interleaved per row for correct z-order)
    drawDemoWallbreakers(nowMs);
    drawPinkBot(nowMs);

    // Draw player bot with smooth slide
    const frame = frameForBot("goldBot", "alphanoid", demo.facing);
    const pos = getDrawPos(nowMs);

    ctx.save();
    if (demo.goldGhost) ctx.globalAlpha = 0.45;

    if (botsImg.isLoaded) {
      const col = frame % BOT_SHEET.cols;
      const row = Math.floor(frame / BOT_SHEET.cols);
      ctx.drawImage(
        botsImg.image,
        col * 32, row * 32, 32, 32,
        pos.x, pos.y, TILE_PX, TILE_PX
      );
    } else {
      ctx.fillStyle = demo.goldGhost ? "rgba(245,197,66,0.4)" : "#f5c542";
      ctx.fillRect(pos.x + 4, pos.y + 4, TILE_PX - 8, TILE_PX - 8);
    }
    ctx.restore();

    // Color changes left above head (show during colorChanging and wallBuilding)
    if (demo.colorChangesLeft > 0 && (demo.mode === "colorChanging" || demo.mode === "wallBuilding")) {
      ctx.save();
      ctx.font = '700 18px "Goldman"';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(String(demo.colorChangesLeft), pos.x + TILE_PX / 2, pos.y);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(demo.colorChangesLeft), pos.x + TILE_PX / 2, pos.y);
      ctx.restore();
    }

    // Walls left on body
    if (demo.mode === "wallBuilding" && demo.wallsLeft > 0) {
      ctx.save();
      ctx.font = '700 16px "Goldman"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(String(demo.wallsLeft), pos.x + TILE_PX / 2, pos.y + TILE_PX / 2 + 4);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(demo.wallsLeft), pos.x + TILE_PX / 2, pos.y + TILE_PX / 2 + 4);
      ctx.restore();
    }

    // Cooldown progress bar above head (matches Botonoid.ts: shrinking white bar)
    if (demo.mode === "cooldown") {
      const elapsed = nowMs - demo.cooldownStartMs;
      const t = Math.min(1, elapsed / demo.cooldownDurMs);
      const percent = 1 - t; // shrinks as cooldown progresses
      const w = TILE_PX * percent;
      const h = 6;
      const barY = pos.y - h;
      ctx.save();
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillRect(pos.x, barY, w, h);
      ctx.restore();
    }

    // Explosions (on top of everything)
    drawDemoExplosions(nowMs);

    // Floating item notifications
    const itemsImgForNotif = resources.images.items;
    itemNotifs.draw(ctx, nowMs, itemsImgForNotif.isLoaded ? itemsImgForNotif.image : null);

    // Score
    ctx.save();
    ctx.font = '700 14px "Goldman"';
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(`Score: ${demo.score}`, demoCanvas.width - 4, 4);
    ctx.fillStyle = "#f5c542";
    ctx.fillText(`Score: ${demo.score}`, demoCanvas.width - 4, 4);
    ctx.restore();


    // Mode indicator
    if (demo.mode !== "walking") {
      const modeLabels: Record<string, string> = {
        colorChanging: "COLOR CHANGE",
        wallBuilding: "WALL BUILD",
        cooldown: "COOLDOWN",
      };
      const modeLabel = modeLabels[demo.mode] ?? "";
      const modeColors: Record<string, string> = {
        colorChanging: "#7ec6f5",
        wallBuilding: "#f5c542",
        cooldown: "#aaa",
      };
      ctx.save();
      ctx.font = '700 12px "Goldman"';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(modeLabel, 4, 4);
      ctx.fillStyle = modeColors[demo.mode] ?? "#fff";
      ctx.fillText(modeLabel, 4, 4);
      ctx.restore();
    }
  }

  // ─── Helpers ───

  function isWallTile(idx: number): boolean {
    return idx === 6 || idx === 9 || idx === 12 || idx === 15;
  }

  // Gold bot passes through gold walls (9), blocked by pink/black/white
  function isGoldBlockedByWall(idx: number): boolean {
    return idx === PINK_WALL || idx === 12 || idx === 15;
  }

  // Pink bot passes through pink walls (6), blocked by gold/black/white
  function isPinkBlockedByWall(idx: number): boolean {
    return idx === WALL || idx === 12 || idx === 15;
  }

  // ─── Pink bot AI ───

  function updatePinkMoveAnim(nowMs: number) {
    if (!demo.pinkMoveAnim) return;
    const elapsed = nowMs - demo.pinkMoveAnim.startMs;
    if (elapsed >= demo.pinkMoveAnim.durMs) {
      demo.pinkMoveAnim = null;
    }
  }

  function updatePinkGhost(nowMs: number) {
    if (demo.pinkGhost && nowMs >= demo.pinkGhostEndMs) {
      demo.pinkGhost = false;
    }
  }

  function updateGoldGhost(nowMs: number) {
    if (demo.goldGhost && nowMs >= demo.goldGhostEndMs) {
      demo.goldGhost = false;
    }
  }

  function tryMovePink(nowMs: number) {
    if (!demo.showPinkBot) return;
    if (demo.pinkMoveAnim) return;

    // Occasionally pick a new random direction
    if (nowMs >= demo.pinkNextDirMs) {
      const dirs: Dir[] = ["up", "down", "left", "right"];
      demo.pinkCurrentDir = dirs[Math.floor(Math.random() * 4)];
      demo.pinkNextDirMs = nowMs + 800 + Math.random() * 1200;
    }

    const dir = demo.pinkCurrentDir;
    const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const nx = demo.pinkPx + dx;
    const ny = demo.pinkPy + dy;

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      demo.pinkNextDirMs = nowMs; // retry immediately with new dir
      return;
    }
    // Pink bot is blocked by non-pink wall tiles unless ghosting
    if (!demo.pinkGhost && isPinkBlockedByWall(demo.tiles[ny][nx])) {
      demo.pinkNextDirMs = nowMs;
      return;
    }
    // Pink bot is blocked by gold silly pads (unless ghosted)
    if (!demo.pinkGhost && demo.sillyPads.has(`${ny},${nx}`)) {
      demo.pinkNextDirMs = nowMs;
      return;
    }

    demo.pinkFacing = dir;
    demo.pinkMoveAnim = {
      fromX: demo.pinkPx,
      fromY: demo.pinkPy,
      toX: nx,
      toY: ny,
      startMs: nowMs,
      durMs: MOVE_DURATION_MS,
    };
    demo.pinkPx = nx;
    demo.pinkPy = ny;
  }

  function getPinkDrawPos(nowMs: number): { x: number; y: number } {
    if (!demo.pinkMoveAnim) {
      return { x: demo.pinkPx * TILE_PX, y: demo.pinkPy * TILE_PX };
    }
    const elapsed = nowMs - demo.pinkMoveAnim.startMs;
    const t = Math.min(1, elapsed / demo.pinkMoveAnim.durMs);
    return {
      x: (demo.pinkMoveAnim.fromX + (demo.pinkMoveAnim.toX - demo.pinkMoveAnim.fromX) * t) * TILE_PX,
      y: (demo.pinkMoveAnim.fromY + (demo.pinkMoveAnim.toY - demo.pinkMoveAnim.fromY) * t) * TILE_PX,
    };
  }

  function drawPinkBot(nowMs: number) {
    if (!demo.showPinkBot) return;
    const botsImg = resources.images.bots;
    const pos = getPinkDrawPos(nowMs);
    const frame = frameForBot("pinkBot", "alphanoid", demo.pinkFacing);

    ctx.save();
    if (demo.pinkGhost) ctx.globalAlpha = 0.45;

    if (botsImg.isLoaded) {
      const col = frame % BOT_SHEET.cols;
      const row = Math.floor(frame / BOT_SHEET.cols);
      ctx.drawImage(botsImg.image, col * 32, row * 32, 32, 32, pos.x, pos.y, TILE_PX, TILE_PX);
    } else {
      ctx.fillStyle = demo.pinkGhost ? "rgba(255,56,152,0.4)" : "rgb(255,56,152)";
      ctx.fillRect(pos.x + 4, pos.y + 4, TILE_PX - 8, TILE_PX - 8);
    }
    ctx.restore();
  }

  // ─── Wallbreakers & explosions ───

  function isGardenTile(idx: number): boolean {
    return idx === 7 || idx === 10 || idx === 13 || idx === 16;
  }

  function floodFillGarden(startR: number, startC: number): [number, number][] {
    const visited = new Set<string>();
    const result: [number, number][] = [];
    const stack: [number, number][] = [[startR, startC]];
    while (stack.length > 0) {
      const [r, c] = stack.pop()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (!isGardenTile(demo.tiles[r][c])) continue;
      visited.add(key);
      result.push([r, c]);
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
    return result;
  }

  function triggerExplosion(r: number, c: number, nowMs: number) {
    // Destroy only the tile directly under the wallbreaker
    const idx = demo.tiles[r][c];
    if (isWallTile(idx) || isGardenTile(idx)) {
      demo.tiles[r][c] = Math.floor(Math.random() * NUMBER_OF_COLORS);

      // If a wall was destroyed, also flood-fill and destroy any adjacent connected gardens
      if (isWallTile(idx)) {
        const adjDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const destroyedGardens = new Set<string>();
        for (const [dr, dc] of adjDirs) {
          const gr = r + dr;
          const gc = c + dc;
          if (gr < 0 || gr >= ROWS || gc < 0 || gc >= COLS) continue;
          if (!isGardenTile(demo.tiles[gr][gc])) continue;
          const key = `${gr},${gc}`;
          if (destroyedGardens.has(key)) continue;
          for (const [fr, fc] of floodFillGarden(gr, gc)) {
            destroyedGardens.add(`${fr},${fc}`);
            demo.tiles[fr][fc] = Math.floor(Math.random() * NUMBER_OF_COLORS);
          }
        }
      }
    }

    // Add explosion animation
    demo.demoExplosions.push({ r, c, startMs: nowMs, durMs: EXPLOSION_DUR_MS });

    // Blast radius: any bot within 2 tiles becomes a ghost (40 seconds)
    if (demo.showPinkBot) {
      const dist = Math.abs(demo.pinkPy - r) + Math.abs(demo.pinkPx - c);
      if (dist <= BLAST_RADIUS) {
        demo.pinkGhost = true;
        demo.pinkGhostEndMs = nowMs + GHOST_DUR_MS;
      }
    }
    // Also ghost the gold bot if within blast radius
    const goldDist = Math.abs(demo.py - r) + Math.abs(demo.px - c);
    if (goldDist <= BLAST_RADIUS) {
      demo.goldGhost = true;
      demo.goldGhostEndMs = nowMs + GHOST_DUR_MS;
    }
  }

  function updateWallbreakers(nowMs: number) {
    const remaining: typeof demo.demoWallbreakers = [];
    for (const wb of demo.demoWallbreakers) {
      if (nowMs >= wb.placedMs + wb.durMs) {
        triggerExplosion(wb.r, wb.c, nowMs);
      } else {
        remaining.push(wb);
      }
    }
    demo.demoWallbreakers = remaining;
    demo.demoExplosions = demo.demoExplosions.filter(e => nowMs - e.startMs < e.durMs);
  }

  function drawDemoWallbreakers(nowMs: number) {
    const itemsImg = resources.images.items;
    for (const wb of demo.demoWallbreakers) {
      const x = wb.c * TILE_PX;
      const y = wb.r * TILE_PX;
      const elapsed = nowMs - wb.placedMs;
      const t = Math.max(0, Math.min(1, elapsed / wb.durMs));
      const remaining = wb.durMs - elapsed;

      if (itemsImg.isLoaded) {
        ctx.drawImage(itemsImg.image, 0, 3 * 32, 32, 32, x, y, TILE_PX, TILE_PX);
      }

      if (remaining > 100) {
        const f0 = 1.5, f1 = 18.0;
        const phase = 2 * Math.PI * (f0 * t + 0.5 * (f1 - f0) * t * t);
        const pulse = 0.5 + 0.5 * Math.sin(phase);
        const redness = (0.2 + 0.8 * pulse) * 0.6;
        ctx.fillStyle = `rgba(255,0,0,${redness.toFixed(3)})`;
        ctx.fillRect(x, y, TILE_PX, TILE_PX);
      } else {
        const p = remaining / 100;
        const flash = (1 - p) * (1 - p);
        ctx.fillStyle = `rgba(255,255,0,${flash.toFixed(3)})`;
        ctx.fillRect(x, y, TILE_PX, TILE_PX);
      }
    }
  }

  function drawDemoExplosions(nowMs: number) {
    for (const e of demo.demoExplosions) {
      const t = Math.min(1, (nowMs - e.startMs) / e.durMs);
      if (t <= 0 || t >= 1) continue;
      const cx = e.c * TILE_PX + TILE_PX / 2;
      const cy = e.r * TILE_PX + TILE_PX / 2;
      const fade = 1 - t;
      const maxRadius = TILE_PX * 2.2;
      const radius = maxRadius * (0.2 + 0.8 * t);

      ctx.save();
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0.0, `rgba(255,255,200,${(0.85 * fade).toFixed(3)})`);
      gradient.addColorStop(0.4, `rgba(255,150,50,${(0.65 * fade).toFixed(3)})`);
      gradient.addColorStop(1.0, "rgba(255,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,230,130,${(0.9 * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, TILE_PX * 0.08 * fade);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,235,160,${(0.75 * fade).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 2.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * radius * 0.25, cy + Math.sin(a) * radius * 0.25);
        ctx.lineTo(cx + Math.cos(a) * radius * 0.75, cy + Math.sin(a) * radius * 0.75);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawItemCard(nowMs: number) {
    const cardCanvas = document.getElementById("htp-item-card-canvas") as HTMLCanvasElement | null;
    if (!cardCanvas) return;

    if (!demo.itemCardVisible) {
      cardCanvas.style.display = "none";
      return;
    }
    cardCanvas.style.display = "block";

    const cardCtx = cardCanvas.getContext("2d")!;
    cardCtx.imageSmoothingEnabled = false;
    cardCtx.clearRect(0, 0, cardCanvas.width, cardCanvas.height);

    const cardW = 120;
    const cardH = 44;
    const cardX = (cardCanvas.width - cardW) / 2;
    const cardY = (cardCanvas.height - cardH) / 2;

    const itemsImg = resources.images.items;
    const spriteW = 32;
    const spriteH = 32;
    const occupiedWidth = spriteW * 3;
    const unoccupiedWidth = cardW - occupiedWidth;
    const whiteSpace = unoccupiedWidth / 4;

    // Card border (gold)
    cardCtx.strokeStyle = "rgb(255,207,0)";
    cardCtx.lineWidth = 4;
    cardCtx.strokeRect(cardX, cardY, cardW, cardH);

    const basePositions = [
      { x: cardX + whiteSpace,               y: cardY + cardH / 2 - spriteH / 2 },
      { x: cardX + cardW / 2 - spriteW / 2,  y: cardY + cardH / 2 - spriteH / 2 },
      { x: cardX + cardW - spriteW - whiteSpace, y: cardY + cardH / 2 - spriteH / 2 },
    ];

    for (let i = 0; i < 3; i++) {
      let { x, y } = basePositions[i];
      const isSelected = i === demo.selectedItemIdx;

      if (isSelected) {
        cardCtx.fillStyle = "rgb(255,207,0)";
        cardCtx.fillRect(x, y, spriteW, spriteH);
        cardCtx.strokeStyle = "rgb(176,145,0)";
        cardCtx.lineWidth = 2;
        cardCtx.strokeRect(x, y, spriteW, spriteH);
        y -= 3;
      }

      if (itemsImg.isLoaded) {
        cardCtx.drawImage(itemsImg.image, 0, i * 32, 32, 32, x, y, spriteW, spriteH);
      } else {
        cardCtx.fillStyle = ["#4af", "#f84", "#8f8"][i];
        cardCtx.fillRect(x + 4, y + 4, spriteW - 8, spriteH - 8);
      }

      // Item count (ghost item: no number normally, countdown when active)
      let countText: string | null = null;
      if (i === 2) {
        // Ghost: show countdown when ghosted, nothing otherwise
        if (demo.goldGhost) {
          countText = String(Math.ceil(Math.max(0, demo.goldGhostEndMs - nowMs) / 1000));
        }
      } else {
        countText = String(demo.itemCounts[i]);
      }
      if (countText !== null) {
        cardCtx.save();
        cardCtx.font = '400 21px "Goldman"';
        cardCtx.textBaseline = "middle";
        cardCtx.textAlign = "left";
        cardCtx.lineWidth = 3;
        cardCtx.strokeStyle = "#000";
        cardCtx.fillStyle = "#fff";
        cardCtx.strokeText(countText, x + 5, y + spriteH / 2 + 4);
        cardCtx.fillText(countText, x + 5, y + spriteH / 2 + 4);
        cardCtx.restore();
      }
    }
  }

  function drawTileOrder() {
    const canvas = document.getElementById("htp-tile-order-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const tCtx = canvas.getContext("2d")!;
    tCtx.imageSmoothingEnabled = false;
    tCtx.clearRect(0, 0, canvas.width, canvas.height);

    const tilesImg = resources.images.tiles;
    const tileW = 32;
    const arrowGap = 5;
    const arrowW = 12;
    let cursorX = 4;
    const y = 2;

    const frames = [0, 1, 2, 3, 4, 0];
    for (let i = 0; i < frames.length; i++) {
      if (tilesImg.isLoaded) {
        tCtx.drawImage(
          tilesImg.image,
          0, frames[i] * TILE_FRAME_SIZE, TILE_FRAME_SIZE, TILE_FRAME_SIZE,
          cursorX, y, tileW, tileW
        );
      }
      tCtx.strokeStyle = "#000";
      tCtx.lineWidth = 1;
      tCtx.strokeRect(cursorX, y, tileW, tileW);
      cursorX += tileW;

      if (i < frames.length - 1) {
        cursorX += arrowGap;
        const midY = y + tileW / 2;
        tCtx.strokeStyle = "#f2f2f2";
        tCtx.beginPath();
        tCtx.moveTo(cursorX, midY);
        tCtx.lineTo(cursorX + arrowW, midY);
        tCtx.stroke();
        tCtx.fillStyle = "#f2f2f2";
        tCtx.beginPath();
        tCtx.moveTo(cursorX + arrowW, midY);
        tCtx.lineTo(cursorX + arrowW - 4, midY - 4);
        tCtx.lineTo(cursorX + arrowW - 4, midY + 4);
        tCtx.closePath();
        tCtx.fill();
        cursorX += arrowW + arrowGap;
      }
    }
  }

  function drawItemIcons() {
    const icons = document.querySelectorAll<HTMLCanvasElement>(".htp-item-icon");
    const itemsImg = resources.images.items;
    if (!itemsImg.isLoaded) return;

    icons.forEach((el) => {
      const frameIdx = parseInt(el.dataset.frame ?? "0", 10);
      const iCtx = el.getContext("2d")!;
      iCtx.imageSmoothingEnabled = false;
      iCtx.clearRect(0, 0, 32, 32);
      iCtx.drawImage(itemsImg.image, 0, frameIdx * 32, 32, 32, 0, 0, 32, 32);
    });
  }

  // ─── Page navigation ───

  function setPage(idx: number) {
    currentPage = Math.max(0, Math.min(pages.length - 1, idx));
    const page = pages[currentPage];
    const controls = args.getControls();

    titleEl.textContent = page.title;
    textArea.innerHTML = page.html(controls);
    demoHint.textContent = page.hint(controls);
    pageIndicator.textContent = `${currentPage + 1} / ${pages.length}`;

    prevBtn.disabled = currentPage === 0;
    nextBtn.textContent = currentPage === pages.length - 1 ? "Close" : "Next";

    page.setup(demo);
    pendingColorChange = null;
    keysDown.clear();
    keysPressed.clear();
    dirStack = [];
    actionDown = false;
    moveOvershootMs = 0;
    itemNotifs.clear();

    setTimeout(() => {
      drawTileOrder();
      drawItemIcons();
    }, 50);
  }

  prevBtn.addEventListener("click", () => { setPage(currentPage - 1); demoCanvas.focus(); });
  nextBtn.addEventListener("click", () => {
    if (currentPage === pages.length - 1) {
      close();
    } else {
      setPage(currentPage + 1);
      demoCanvas.focus();
    }
  });

  // ─── Main loop ───

  function tick(nowMs: number) {
    if (!isOpenState) return;

    // Edge-triggered keys
    for (const key of keysPressed) {
      if (isActionKey(key)) {
        handleAction(nowMs);
      } else if (isChangeItemKey(key) && demo.itemCardVisible) {
        demo.selectedItemIdx = (demo.selectedItemIdx + 1) % 3;
      } else if (isUseItemKey(key)) {
        handleUseItem(nowMs);
      }
    }
    keysPressed.clear();

    updateCooldown(nowMs);
    updateMoveAnim(nowMs);
    tryMove(nowMs);
    updatePinkMoveAnim(nowMs);
    updatePinkGhost(nowMs);
    updateGoldGhost(nowMs);
    tryMovePink(nowMs);
    updateWallbreakers(nowMs);
    drawDemo(nowMs);
    drawItemCard(nowMs);
    animFrame = requestAnimationFrame(tick);
  }

  function open() {
    if (isOpenState) return;
    isOpenState = true;
    root.style.display = "flex";
    setPage(0);
    // Remove focus from any button so space key can't re-trigger it
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    args.onOpenChange(true);
    animFrame = requestAnimationFrame(tick);
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    root.style.display = "none";
    const cardCanvas = document.getElementById("htp-item-card-canvas") as HTMLCanvasElement | null;
    if (cardCanvas) cardCanvas.style.display = "none";
    keysDown.clear();
    keysPressed.clear();
    dirStack = [];
    actionDown = false;
    moveOvershootMs = 0;
    pendingColorChange = null;
    if (animFrame) cancelAnimationFrame(animFrame);
    args.onOpenChange(false);
  }

  closeBtn.addEventListener("click", close);

  return {
    open,
    close,
    isOpen: () => isOpenState,
  };
}
