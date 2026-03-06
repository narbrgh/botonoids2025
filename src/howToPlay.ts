import { resources } from "./Resources";
import { NUMBER_OF_COLORS } from "./Constants";
import { frameForBot, BOT_SHEET } from "./botonoidSheet";
import type { ControlsState } from "./optionsOverlay";

// ─── Tile indices (matching server: tilemap.go) ───
// 0–4 = color tiles
// 5 = gold foundation, 6 = gold wall, 7 = gold garden
// Gold-role tile indices (gold foundation=8, wall=9, garden=10 in sprite sheet)
const FOUNDATION = 8;
const WALL = 9;
const GARDEN = 10;
const MIN_COMBO = 6;
const MAX_COLOR_CHANGES = 5;

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
      demo.wallsLeft = 4;
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
    hint: () => "Walk around freely on this page.",
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
  let bestGarden: [number, number][] = [];

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
      if (tileIdx > NUMBER_OF_COLORS - 1 && tileIdx !== FOUNDATION) continue;
      visited.add(key);
      gardenable.push([r, c]);
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    if (edgeHits.size <= 2 && gardenable.length > 0) {
      if (gardenable.length > bestGarden.length) {
        bestGarden = gardenable;
      }
    }
  }
  return bestGarden;
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

  function isBoundEvent(e: KeyboardEvent): boolean {
    return isDirEvent(e) !== null || isActionEvent(e);
  }

  // String-based versions for checking keysPressed/keysDown sets in the game loop
  function isActionKey(key: string): boolean {
    const c = args.getControls();
    return normalizeKey(key) === normalizeKey(c.action);
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

    // Draw player bot with smooth slide
    const frame = frameForBot("goldBot", "alphanoid", demo.facing);
    const pos = getDrawPos(nowMs);

    if (botsImg.isLoaded) {
      const col = frame % BOT_SHEET.cols;
      const row = Math.floor(frame / BOT_SHEET.cols);
      ctx.drawImage(
        botsImg.image,
        col * 32, row * 32, 32, 32,
        pos.x, pos.y, TILE_PX, TILE_PX
      );
    } else {
      ctx.fillStyle = "#f5c542";
      ctx.fillRect(pos.x + 4, pos.y + 4, TILE_PX - 8, TILE_PX - 8);
    }

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

    // Edge-triggered action (for entering colorChanging mode, or building a wall on press)
    for (const key of keysPressed) {
      if (isActionKey(key)) {
        handleAction(nowMs);
        break;
      }
    }
    keysPressed.clear();

    updateCooldown(nowMs);
    updateMoveAnim(nowMs);
    tryMove(nowMs);
    drawDemo(nowMs);
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
