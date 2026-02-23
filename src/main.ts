import NetClient from './net/NetClient';

import { GameLoop } from './GameLoop';
import { Sprite } from './Sprite';
import Vector2 from './Vector2';
import { resources } from './Resources';
import TileMap from './TileMap';
import Botonoid from './Botonoid';
import type { PlayerSnapshotMsg, PlayerDeltaMsg, PlayerMetaSnapshotMsg, PlayerStatusSnapshotMsg, TileMapSnapshotMsg, TileChangeMsg , TileInitiateChangeMsg, TileChangeListMsg, SillyPadMsg, WallbreakerMsg, RoomsListOkMsg, ChatMsg} from './protocol'
import type { Phase , Role , Model } from './protocol';
import {initLobbyUI, lobbyState } from "./lobby";
import { initRoomsBrowserUI } from "./roomsBrowser";

import HUD from "./hud";

import {frameForBot, BOT_SHEET} from './botonoidSheet'

import { TILE_SIZE, FRAME_SIZE, Y_DRAW_OFFSET } from './Constants';

import type { DirType } from './protocol';

import KeyboardController, { type KeyMap } from './KeyboardController';
import { P2_KEYS } from './keymaps';
import ServerClock from './ServerClock';
import {
  initOptionsOverlay,
  type ControlsState,
  type MusicChoice,
  type RebindConflict,
} from "./optionsOverlay";

import './style.css'
import AudioManager from './AudioManager';
//import type { Command } from './commands';


//Set up main canvas element
const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas = canvasEl;
const gameWrap = document.getElementById('game-wrap');
if (!(gameWrap instanceof HTMLElement)) throw new Error('Missing #game-wrap');
gameWrap.style.width = `${canvas.width}px`;
gameWrap.style.height = `${canvas.height}px`;

const ctxEl = canvas.getContext('2d');
if (!ctxEl) throw new Error('2D context not available');
const ctx = ctxEl;

ctx.imageSmoothingEnabled = false

const audio = new AudioManager({ sfxPitchMin: 0.95, sfxPitchMax: 1.05 });
const musicExt = (() => {
  const probe = document.createElement("audio");
  const oggSupport = probe.canPlayType('audio/ogg; codecs="vorbis"');
  return oggSupport === "probably" || oggSupport === "maybe" ? "ogg" : "m4a";
})();

function musicUrl(name: string): string {
  return `/music/${encodeURIComponent(name)}.${musicExt}`;
}

const audioUrls = {
  theme: musicUrl("theme"),
  train: musicUrl("train"),
  puzzlerIntro: musicUrl("puzzlerintro"),
  puzzlerSong: musicUrl("puzzlersong"),
  happyIntro: musicUrl("happyintro"),
  happySong: musicUrl("happysong"),
  epicIntro: musicUrl("epicintro"),
  epicSong: musicUrl("epicsong"),
  combo: "/sfx/combo.wav",
  garden: "/sfx/garden.wav",
  explosion: "/sfx/explosion.wav",
  wall: "/sfx/wall.wav",
  sillypadlay: "/sfx/sillypadlay.wav",
  color: "/sfx/color.wav",
  beep: "/sfx/beep.wav",
  bang: "/sfx/bang.wav",
  tick: "/sfx/tick.wav",
} as const;

audio.registerMusic("menu", audioUrls.theme, { loop: true, volume: 0.6 });
audio.registerMusic("train", audioUrls.train, { loop: true, volume: 0.6 });
audio.registerMusicIntroLoop("puzzler", audioUrls.puzzlerIntro, audioUrls.puzzlerSong, { volume: 0.6 });
audio.registerMusicIntroLoop("happy", audioUrls.happyIntro, audioUrls.happySong, { volume: 0.6 });
audio.registerMusicIntroLoop("epic", audioUrls.epicIntro, audioUrls.epicSong, { volume: 0.6 });
audio.loadSfx("combo", audioUrls.combo);
audio.loadSfx("garden", audioUrls.garden);
audio.loadSfx("explosion", audioUrls.explosion);
audio.loadSfx("wall", audioUrls.wall);
audio.loadSfx("sillypadlay", audioUrls.sillypadlay);
audio.loadSfx("color", audioUrls.color);
audio.loadSfx("beep", audioUrls.beep);
audio.loadSfx("bang", audioUrls.bang);
audio.loadSfx("tick", audioUrls.tick);
audio.setMusicVolume(1);
audio.setSfxVolume(1);

const gameMusicKeys = ["puzzler", "happy", "epic"] as const;
type GameMusicKey = typeof gameMusicKeys[number];
let currentMusicKey: string | null = null;
let selectedGameMusic: GameMusicKey | null = null;
let selectedMusicChoice: MusicChoice = "random";
let optionsMusicPreview: GameMusicKey | null = null;

function chooseGameMusic(): GameMusicKey {
  if (!selectedGameMusic) {
    const idx = Math.floor(Math.random() * gameMusicKeys.length);
    selectedGameMusic = gameMusicKeys[idx];
  }
  return selectedGameMusic;
}

function setMusic(key: string | null): void {
  if (key === currentMusicKey) {
    if (key) audio.playMusic(key);
    return;
  }
  if (currentMusicKey) audio.stopMusic(currentMusicKey);
  currentMusicKey = key;
  if (key) audio.playMusic(key);
}

function updateMusicState(): void {
  const inResultsPhase = joinedRoomId !== null && currentPhase === "phaseFinished" && !localResultsDismissed;
  if (inResultsPhase) {
    setMusic("train");
    return;
  }

  if (optionsOpen) {
    if (optionsMusicPreview) {
      setMusic(optionsMusicPreview);
      return;
    }
  }

  const inMenu = !joinedRoomId || currentPhase === "phaseLobby";
  const inCountdown = currentPhase === "phaseCountdown";
  const inGame = currentPhase === "phasePlaying";

  if (!inGame) {
    selectedGameMusic = null;
  }

  if (inMenu) {
    setMusic(selectedMusicChoice === "random" ? "menu" : selectedMusicChoice);
    return;
  }
  if (inCountdown) {
    setMusic(null);
    return;
  }
  if (inGame) {
    setMusic(selectedMusicChoice === "random" ? chooseGameMusic() : selectedMusicChoice);
    return;
  }
  setMusic(null);
}

const unlockAudioOnce = async () => {
  await audio.unlock();
  updateMusicState();
};
window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
window.addEventListener("keydown", unlockAudioOnce, { once: true });

//Set up HUD
let hud = new HUD(ctx);


//Set up small canvas element that draws the botonoid preview in the lobby screen
const previewCanvasEl = document.getElementById('botonoid-preview-canvas');
if (!(previewCanvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #previewCanvas not found');
const previewCanvas = previewCanvasEl;

const previewCtxEl = previewCanvas.getContext('2d');
if (!previewCtxEl) throw new Error ('2D context of preview canvas not available');
const previewCtx = previewCtxEl;
previewCtx.imageSmoothingEnabled = false

const lobby = document.getElementById("lobby")!;
const soloPracticeDialog = document.getElementById("solo-practice-dialog");
const soloPracticeCancelBtn = document.getElementById("solo-practice-cancel-btn") as HTMLButtonElement | null;
const soloPracticeConfirmBtn = document.getElementById("solo-practice-confirm-btn") as HTMLButtonElement | null;
const inGameMenuRoot = document.getElementById("in-game-menu-root");
const inGameMenuToggleBtn = document.getElementById("in-game-menu-toggle-btn") as HTMLButtonElement | null;
const inGameMenuPanel = document.getElementById("in-game-menu-panel") as HTMLElement | null;
const inGameMenuOptionsBtn = document.getElementById("in-game-menu-options-btn") as HTMLButtonElement | null;
const inGameMenuQuitBtn = document.getElementById("in-game-menu-quit-btn") as HTMLButtonElement | null;
const inGameMenuCloseBtn = document.getElementById("in-game-menu-close-btn") as HTMLButtonElement | null;
const resultsOverlay = document.getElementById("results-overlay") as HTMLElement | null;
const resultsListEl = document.getElementById("results-list") as HTMLElement | null;
const resultsCountdownEl = document.getElementById("results-countdown") as HTMLElement | null;
const resultsOkBtn = document.getElementById("results-ok-btn") as HTMLButtonElement | null;
let joinedRoomId: string | null = null;
let currentPhase: Phase = 'phaseLobby'
let latestLobbyPlayers: PlayerSnapshotMsg["players"] = [];
const playerStateById = new Map<number, PlayerSnapshotMsg["players"][number]>();
const playerMetaById = new Map<number, { name?: string; role: Role; model: Model }>();
const playerStatusById = new Map<number, { ready: boolean; resultsRole: Role; resultsDismissed: boolean }>();
let checksumMismatchStreak = 0;
let lastResyncRequestAtMs = 0;
let goOverlayUntilMs = 0;
let pauseMenuOpen = false;
let optionsOpen = false;
let lastDir: DirType | null = null;
let localResultsDismissed = false;

type BindingAction = keyof KeyMap;
const BINDING_ACTIONS: BindingAction[] = ["up", "down", "left", "right", "action", "changeItem", "useItem"];
const DEFAULT_KEYMAP: KeyMap = cloneKeyMap(P2_KEYS);
const playerKeyMap: KeyMap = cloneKeyMap(DEFAULT_KEYMAP);
let controlLabels: ControlsState = keyMapToControlsState(playerKeyMap);

function cloneKeyMap(map: KeyMap): KeyMap {
  return {
    up: [...map.up],
    down: [...map.down],
    left: [...map.left],
    right: [...map.right],
    action: [...map.action],
    changeItem: [...map.changeItem],
    useItem: [...map.useItem],
  };
}

function keyMapToControlsState(map: KeyMap): ControlsState {
  return {
    up: map.up[0] ?? "ArrowUp",
    down: map.down[0] ?? "ArrowDown",
    left: map.left[0] ?? "ArrowLeft",
    right: map.right[0] ?? "ArrowRight",
    action: map.action[0] ?? " ",
    changeItem: map.changeItem[0] ?? "Shift",
    useItem: map.useItem[0] ?? "Control",
  };
}

function normalizeBindingKey(key: string): string {
  if (key === " ") return " ";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function variantsForBoundKey(key: string): string[] {
  if (key === " ") return [" ", "Space"];
  if (key.length === 1 && key.toLowerCase() !== key.toUpperCase()) {
    return [key.toLowerCase(), key.toUpperCase()];
  }
  return [key];
}

let optionsOverlay: ReturnType<typeof initOptionsOverlay> | null = null;

function openOptions(): void {
  optionsOverlay?.setControls(controlLabels);
  optionsOverlay?.setMusicChoice(selectedMusicChoice);
  optionsOverlay?.setRebindConflict(findFirstBindingConflict(controlLabels));
  optionsOverlay?.open();
}

function findFirstBindingConflict(state: ControlsState): RebindConflict | null {
  const actions = BINDING_ACTIONS;
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i];
      const b = actions[j];
      if (normalizeBindingKey(state[a]) === normalizeBindingKey(state[b])) {
        return { action: a, conflictsWith: b, key: state[a] };
      }
    }
  }
  return null;
}

function requestRoomsList() {
  net.sendCommand({ type: 'roomsList' });
}

function mergePlayersWithMeta(players: PlayerSnapshotMsg["players"]): PlayerSnapshotMsg["players"] {
  return players.map((p) => {
    const meta = playerMetaById.get(p.id);
    const status = playerStatusById.get(p.id);
    return {
      ...p,
      name: p.name ?? meta?.name,
      role: p.role ?? meta?.role ?? "observer",
      model: p.model ?? meta?.model ?? "alphanoid",
      ready: status?.ready ?? false,
      resultsRole: status?.resultsRole ?? (p.role ?? meta?.role ?? "observer"),
      resultsDismissed: status?.resultsDismissed ?? false,
    };
  });
}

function getMergedPlayers(): PlayerSnapshotMsg["players"] {
  const base = Array.from(playerStateById.values());
  base.sort((a, b) => a.id - b.id);
  return mergePlayersWithMeta(base);
}

const roomsBrowserUI = initRoomsBrowserUI({
  onCreateRoom: (name, maxPlayers) => {
    roomsBrowserUI.setError("");
    net.sendCommand({ type: "roomCreate", name, maxPlayers });
  },
  onJoinRoom: (roomId) => {
    roomsBrowserUI.setError("");
    net.sendCommand({ type: "roomJoin", roomId });
  },
  onRefreshRooms: () => {
    roomsBrowserUI.setError("");
    requestRoomsList();
  },
  onOpenOptions: () => {
    openOptions();
  },
});

optionsOverlay = initOptionsOverlay({
  controls: controlLabels,
  musicChoice: selectedMusicChoice,
  musicVolume: 1,
  sfxVolume: 1,
  onOpenChange: (open) => {
    optionsOpen = open;
    if (open) {
      setInGameMenuOpen(false);
      if (joinedRoomId !== null && currentPhase === "phasePlaying") {
        net.sendCommand({ type: "input", dir: null });
        lastDir = null;
      }
    } else {
      optionsMusicPreview = null;
      optionsOverlay?.setRebindPending(null);
      optionsOverlay?.setRebindConflict(null);
    }
    updateMusicState();
  },
  onApplyRebind: (action, key) => {
    controlLabels = { ...controlLabels, [action]: key };
    playerKeyMap[action] = variantsForBoundKey(key);
    const conflict = findFirstBindingConflict(controlLabels);
    optionsOverlay?.setControls(controlLabels);
    optionsOverlay?.setRebindPending(null);
    optionsOverlay?.setRebindConflict(conflict);
    if (joinedRoomId !== null && currentPhase === "phasePlaying") {
      net.sendCommand({ type: "input", dir: null });
      lastDir = null;
    }
  },
  onCancelRebind: () => {
    optionsOverlay?.setRebindPending(null);
    optionsOverlay?.setRebindConflict(findFirstBindingConflict(controlLabels));
  },
  onMusicChoiceChange: (choice) => {
    selectedMusicChoice = choice;
    optionsOverlay?.setMusicChoice(choice);
    if (choice === "random") {
      optionsMusicPreview = null;
      updateMusicState();
      return;
    }
    optionsMusicPreview = choice;
    updateMusicState();
  },
  onMusicVolumeChange: (value) => {
    audio.setMusicVolume(value);
    optionsOverlay?.setMusicVolume(value);
  },
  onSfxVolumeChange: (value) => {
    audio.setSfxVolume(value);
    optionsOverlay?.setSfxVolume(value);
  },
  onResetControls: () => {
    const defaults = cloneKeyMap(DEFAULT_KEYMAP);
    for (const action of BINDING_ACTIONS) {
      playerKeyMap[action] = [...defaults[action]];
    }
    controlLabels = keyMapToControlsState(playerKeyMap);
    optionsOverlay?.setControls(controlLabels);
    optionsOverlay?.setRebindPending(null);
    optionsOverlay?.setRebindConflict(findFirstBindingConflict(controlLabels));
    if (joinedRoomId !== null && currentPhase === "phasePlaying") {
      net.sendCommand({ type: "input", dir: null });
      lastDir = null;
    }
  },
});

function applyOverlayState() {
  roomsBrowserUI.setVisible(!joinedRoomId);
  const showLobby = joinedRoomId !== null && (currentPhase === 'phaseLobby' || (currentPhase === "phaseFinished" && localResultsDismissed));
  lobby.style.display = showLobby ? "flex" : "none";
  const showInGameMenu = joinedRoomId !== null && currentPhase === "phasePlaying";
  if (inGameMenuRoot instanceof HTMLElement) {
    inGameMenuRoot.style.display = showInGameMenu ? "flex" : "none";
  }
  if (!showInGameMenu) {
    pauseMenuOpen = false;
    if (inGameMenuPanel) inGameMenuPanel.style.display = "none";
    if (inGameMenuToggleBtn) inGameMenuToggleBtn.style.display = "grid";
  }
  if (resultsOverlay) {
    const showResults = joinedRoomId !== null && currentPhase === "phaseFinished" && !localResultsDismissed;
    resultsOverlay.style.display = showResults ? "flex" : "none";
  }
}

function getRoleColors(role: Role): { color: string; color2: string } {
  switch (role) {
    case "goldBot":
      return { color: "rgb(255,207,0)", color2: "rgb(176,145,0)" };
    case "blackBot":
      return { color: "rgb(0,0,0)", color2: "rgb(148,255,127)" };
    case "whiteBot":
      return { color: "rgb(254, 254, 254)", color2: "rgb(255,62,62)" };
    case "pinkBot":
      return { color: "rgb(255, 56, 152)", color2: "rgb(158,38,96)" };
    default:
      return { color: "rgb(144, 19, 19)", color2: "#ffffff" };
  }
}

function renderResultsOverlay(players: PlayerSnapshotMsg["players"]): void {
  if (!resultsListEl || !resultsCountdownEl) return;

  const participants = players.filter((p) => p.resultsRole !== "observer");
  const list = (participants.length > 0 ? participants : players)
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id - b.id;
    });

  resultsListEl.innerHTML = "";
  if (list.length === 0) {
    resultsCountdownEl.textContent = "";
    return;
  }

  const maxScore = Math.max(1, ...list.map((p) => p.score));
  let lastScore: number | null = null;
  let currentRank = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (lastScore === null || p.score !== lastScore) currentRank = i + 1;
    lastScore = p.score;

    const label = (p.name && p.name.trim().length > 0) ? p.name : `Player ${p.id}`;
    const barRatio = Math.max(0, p.score) / maxScore;
    const barPct = Math.round(barRatio * 100);
    const roleForResult = p.resultsRole ?? p.role;
    const { color, color2 } = getRoleColors(roleForResult);
    const frame = frameForBot(roleForResult, p.model, "down");
    const col = frame % BOT_SHEET.cols;
    const row = Math.floor(frame / BOT_SHEET.cols);

    const rowEl = document.createElement("div");
    rowEl.className = "results-row";

    const nameEl = document.createElement("div");
    nameEl.className = "results-name";
    nameEl.textContent = `${currentRank}. ${label}`;

    const avatarEl = document.createElement("span");
    avatarEl.className = "results-avatar";
    avatarEl.style.backgroundPosition = `${-32 * col}px ${-32 * row}px`;

    const barTrack = document.createElement("div");
    barTrack.className = "results-bar-track";
    const barFill = document.createElement("div");
    barFill.className = "results-bar-fill";
    barFill.style.width = `${barPct}%`;
    barFill.style.background = color;
    barFill.style.borderColor = color2;
    barTrack.appendChild(barFill);

    const scoreEl = document.createElement("div");
    scoreEl.className = "results-score";
    scoreEl.textContent = String(p.score);

    rowEl.appendChild(avatarEl);
    rowEl.appendChild(nameEl);
    rowEl.appendChild(barTrack);
    rowEl.appendChild(scoreEl);
    resultsListEl.appendChild(rowEl);
  }

  resultsCountdownEl.textContent = "";
}

function isActiveRole(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && role !== "observer";
}

function getActivePlayerCountForReady(localRole: Role | null): number {
  const localID = net.playerId;
  let count = 0;
  let sawLocal = false;

  for (const p of latestLobbyPlayers) {
    let role = p.role;
    if (localID !== null && p.id === localID) {
      sawLocal = true;
      if (localRole !== null) role = localRole;
    }
    if (isActiveRole(role)) count++;
  }

  if (!sawLocal && isActiveRole(localRole)) {
    count++;
  }
  return count;
}

function getReadyCountsAfterLocalReady(localReady: boolean): { readyCount: number; playerCount: number } {
  const localID = net.playerId;
  let readyCount = 0;
  let playerCount = latestLobbyPlayers.length;
  let sawLocal = false;

  for (const p of latestLobbyPlayers) {
    let ready = p.ready;
    if (localID !== null && p.id === localID) {
      sawLocal = true;
      ready = localReady;
    }
    if (ready) readyCount++;
  }

  if (!sawLocal && joinedRoomId) {
    playerCount++;
    if (localReady) readyCount++;
  }

  return { readyCount, playerCount };
}

function promptSoloPractice(): Promise<boolean> {
  if (!(soloPracticeDialog instanceof HTMLElement) || !soloPracticeCancelBtn || !soloPracticeConfirmBtn) {
    return Promise.resolve(window.confirm("You are creating a one-player game. Press OK for practice or Cancel."));
  }

  const lobbyEl = document.getElementById("lobby") as (HTMLElement & { inert?: boolean }) | null;
  const roomsBrowserEl = document.getElementById("rooms-browser") as (HTMLElement & { inert?: boolean }) | null;
  const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (lobbyEl) lobbyEl.inert = true;
  if (roomsBrowserEl) roomsBrowserEl.inert = true;

  soloPracticeDialog.style.display = "flex";
  soloPracticeCancelBtn.focus();

  return new Promise<boolean>((resolve) => {
    const focusables: HTMLButtonElement[] = [soloPracticeCancelBtn, soloPracticeConfirmBtn];
    const onKeydown = (ev: KeyboardEvent) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        const nextIdx = ev.shiftKey
          ? (idx <= 0 ? focusables.length - 1 : idx - 1)
          : (idx + 1) % focusables.length;
        focusables[nextIdx].focus();
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        onCancel();
      }
    };

    const cleanup = () => {
      soloPracticeDialog.style.display = "none";
      document.removeEventListener("keydown", onKeydown, true);
      soloPracticeCancelBtn.removeEventListener("click", onCancel);
      soloPracticeConfirmBtn.removeEventListener("click", onConfirm);
      if (lobbyEl) lobbyEl.inert = false;
      if (roomsBrowserEl) roomsBrowserEl.inert = false;
      prevFocused?.focus();
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    document.addEventListener("keydown", onKeydown, true);
    soloPracticeCancelBtn.addEventListener("click", onCancel);
    soloPracticeConfirmBtn.addEventListener("click", onConfirm);
  });
}

const lobbyUI = initLobbyUI(async (e) => {
  if (e.type === "ready") {
        if (!joinedRoomId) return;
        if (e.ready && e.role !== "observer") {
          const { readyCount, playerCount } = getReadyCountsAfterLocalReady(e.ready);
          const allPlayersReady = playerCount > 0 && readyCount === playerCount;
          if (!allPlayersReady) {
            net.sendCommand({ type: 'ready', ready: e.ready, role: e.role, model: lobbyState.model });
            return;
          }
          const activePlayers = getActivePlayerCountForReady(e.role);
          if (activePlayers <= 1) {
            const shouldPractice = await promptSoloPractice();
            if (!shouldPractice) {
              lobbyUI.setReadyState(false);
              return;
            }
          }
        }
        net.sendCommand({ type: 'ready', ready: e.ready, role: e.role, model: lobbyState.model });
  } else if (e.type === "role") {
        if (!joinedRoomId) return;
        net.sendCommand({ type: 'roleSelect', role: e.role });
  } else if (e.type === "name") {
        if (!joinedRoomId) return;
        net.sendCommand({ type: 'name', name: e.name });
  } else if (e.type === "chat") {
        if (!joinedRoomId) return;
        net.sendCommand({ type: 'chat', text: e.text });
  } else if (e.type === "options") {
        openOptions();
  } else if (e.type === "back") {
        if (!joinedRoomId) return;
        net.sendCommand({ type: 'roomLeave' });
  }
});

//const cols = Math.floor(canvas.width / TILE_SIZE);
//const rows = Math.floor(canvas.height / TILE_SIZE);

//rather than cols and rows being calculated in the client, they will now default
// to 0 then later be updated by the server -> client message
let cols = 0;
let rows = 0;
let tileSize = TILE_SIZE;
let tileMap: TileMap | null = null;
let numActivePlayers = 0;

const tileSprite = new Sprite({
  resource: resources.images.tiles,
  frameSize: new Vector2(FRAME_SIZE, FRAME_SIZE),
  hFrames: 1,
  vFrames: 17,
  frame: 0,
  scale: TILE_SIZE / FRAME_SIZE, // keep this an integer for pixel art
});

const sillyPadSprite = new Sprite({
  resource: resources.images.sillyPads,
  frameSize: new Vector2(FRAME_SIZE, FRAME_SIZE),
  hFrames: 1,
  vFrames: 4,
  frame: 0,
  scale: TILE_SIZE / FRAME_SIZE, // keep this an integer for pixel art
});

const wallbreakerSprite = new Sprite({
  resource: resources.images.items,
  frameSize: new Vector2(FRAME_SIZE, FRAME_SIZE),
  hFrames: 1,
  vFrames: 4,
  frame: 3,
  scale: TILE_SIZE / FRAME_SIZE,
})

const clock = new ServerClock();
let secondsLeft = 540;

const getEstimatedTick = clock.estimatedTick.bind(clock);
//const tileMap = new TileMap({cols, rows, tileSize: TILE_SIZE, tileSprite, getEstimatedTick });

// ------ Controllers ------
const p1 = new KeyboardController(playerKeyMap, window, {
  isEnabled: () => joinedRoomId !== null && currentPhase === 'phasePlaying' && !pauseMenuOpen && !optionsOpen,
});

// ----- MAP of players ----

const botsById = new Map<number, Botonoid>();


// bools to keep track of which "numbers" have had their soundeffect played (used to make the countdown beeps)
let playedCountdownNumber: boolean[] = [false, false, false, false]


// ------ Net client -------

const net = new NetClient();
net.connect();

function setInGameMenuOpen(open: boolean) {
  pauseMenuOpen = open;
  if (inGameMenuToggleBtn) {
    inGameMenuToggleBtn.style.display = open ? "none" : "grid";
  }
  if (inGameMenuPanel) {
    inGameMenuPanel.style.display = open ? "flex" : "none";
  }
  if (open) {
    // Release any held movement on the server while menu is open.
    net.sendCommand({ type: "input", dir: null });
    lastDir = null;
  }
}

if (inGameMenuToggleBtn) {
  inGameMenuToggleBtn.addEventListener("click", () => {
    setInGameMenuOpen(!pauseMenuOpen);
  });
}

if (inGameMenuCloseBtn) {
  inGameMenuCloseBtn.addEventListener("click", () => setInGameMenuOpen(false));
}

if (inGameMenuOptionsBtn) {
  inGameMenuOptionsBtn.addEventListener("click", () => {
    setInGameMenuOpen(false);
    openOptions();
  });
}

if (inGameMenuQuitBtn) {
  inGameMenuQuitBtn.addEventListener("click", () => {
    setInGameMenuOpen(false);
    if (joinedRoomId) net.sendCommand({ type: "roomLeave" });
  });
}

if (resultsOkBtn) {
  resultsOkBtn.addEventListener("click", () => {
    if (!joinedRoomId || currentPhase !== "phaseFinished") return;
    net.sendCommand({ type: "resultsOk" });
    resultsOkBtn.disabled = true;
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (e.repeat) return;
  if (optionsOpen) return;
  if (!joinedRoomId) return;
  if (currentPhase !== "phaseCountdown") return;
  const target = e.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
  }
  e.preventDefault();
  net.sendCommand({ type: "cancelCountdown" });
});

let prevPhase: Phase = currentPhase;

function handlePhaseChange(next: Phase) {
  if (prevPhase === 'phaseLobby' && next === 'phaseCountdown') {
    //reset the bools for the countdown sound effects
    playedCountdownNumber[0] = playedCountdownNumber[1] = playedCountdownNumber[2] = playedCountdownNumber[3] = false
  }
  if (next === "phaseFinished" && prevPhase !== "phaseFinished") {
    net.sendCommand({ type: "input", dir: null });
    lastDir = null;
  }
  if (next !== "phaseFinished") {
    localResultsDismissed = false;
    if (resultsOkBtn) resultsOkBtn.disabled = false;
  }
  prevPhase = next;
  currentPhase = next;
}

net.onHello = () => {
  if (net.playerId !== null) {
    lobbyUI.setName(`Player ${net.playerId}`);
  }
  requestRoomsList();
};

net.onRoomsList = (m: RoomsListOkMsg) => {
  joinedRoomId = m.yourRoomId ?? null;
  if (joinedRoomId) {
    const room = m.rooms.find((r) => r.id === joinedRoomId);
    if (room) lobbyUI.setRoomName(room.name);
  } else {
    lobbyUI.setRoomName("Lobby");
  }
  roomsBrowserUI.setRooms(m.rooms, joinedRoomId);
  applyOverlayState();
};

net.onRoomCreateOk = (m) => {
  joinedRoomId = m.roomId;
  lobbyUI.resetSelection();
  roomsBrowserUI.setError("");
  requestRoomsList();
  applyOverlayState();
};

net.onRoomJoinOk = (m) => {
  joinedRoomId = m.roomId;
  lobbyUI.resetSelection();
  roomsBrowserUI.setError("");
  requestRoomsList();
  applyOverlayState();
};

net.onRoomLeaveOk = () => {
  joinedRoomId = null;
  lobbyUI.resetSelection();
  roomsBrowserUI.setError("");
  requestRoomsList();
  applyOverlayState();
};

net.onRoomError = (m) => {
  roomsBrowserUI.setError(m.msg);
};

net.onChat = (m: ChatMsg) => {
  lobbyUI.appendChat(`[${m.name}] ${m.text}`);
};

net.onPlayerMetaSnapshot = (m: PlayerMetaSnapshotMsg) => {
  for (const p of m.players) {
    playerMetaById.set(p.id, { name: p.name, role: p.role, model: p.model });
  }
};

net.onPlayerStatusSnapshot = (m: PlayerStatusSnapshotMsg) => {
  for (const p of m.players) {
    playerStatusById.set(p.id, {
      ready: p.ready,
      resultsRole: p.resultsRole,
      resultsDismissed: p.resultsDismissed,
    });
  }
};

function applyPlayerWireState(tick: number, phase: Phase, phaseEndsAtTick: number, mapChecksum: number) {
  const players = getMergedPlayers();
  latestLobbyPlayers = players;
  if (currentPhase === "phaseCountdown" && phase === "phasePlaying") {
    goOverlayUntilMs = performance.now() + 700;
  }

  handlePhaseChange(phase);
  const meFromSnapshot = (net.playerId === null) ? undefined : players.find((p) => p.id === net.playerId);
  localResultsDismissed = !!meFromSnapshot?.resultsDismissed;
  if (resultsOkBtn) resultsOkBtn.disabled = localResultsDismissed;
  updateMusicState();
  lobbyUI.setPlayers(players);
  lobbyUI.setReadyState(!!meFromSnapshot?.ready);
  const unavailable: Role[] = [];
  for (const p of players) {
    if (p.id === net.playerId) continue;
    if (p.role === "goldBot" || p.role === "pinkBot" || p.role === "whiteBot" || p.role === "blackBot") {
      unavailable.push(p.role);
    }
  }
  lobbyUI.setRoleAvailability(unavailable);
  const receivedAtMs = performance.now()
  const seen = new Set<number>();
  const ticksLeft = Math.max(0, phaseEndsAtTick - tick);
  secondsLeft = Math.ceil(clock.ticksToSeconds(ticksLeft));


  for (const p of players) {
    seen.add(p.id);

    let bot = botsById.get(p.id);

    if (!tileMap) return;

    if (!bot) {
      bot = new Botonoid({
        tileX: p.x,
        tileY: p.y,
        tileSize: TILE_SIZE,
        sprite: spriteForPlayer("goldBot","alphanoid"), // defaults to goldBot, alphanoid, but later when the server sends the correct role and model, this will be updated
        tileActions: tileMap,
        getEstimatedTick,
      });
      botsById.set(p.id, bot);
    }
    
    numActivePlayers = [...botsById.values()].filter(b => b.getRole() !== "observer").length;

    bot.setAuthoritativeStateFromPlayerSnapshot(p);
    
  }

  clock.updateSnapshot(tick, receivedAtMs);

  if (tileMap) {
    const localChecksum = tileMap.computeChecksum();
    if (localChecksum === mapChecksum) {
      checksumMismatchStreak = 0;
    } else {
      checksumMismatchStreak++;
      const now = performance.now();
      // Require consecutive mismatches and rate-limit requests to avoid noise.
      if (checksumMismatchStreak >= 2 && (now - lastResyncRequestAtMs) >= 2000) {
        net.sendCommand({ type: "resyncRequest" });
        lastResyncRequestAtMs = now;
        checksumMismatchStreak = 0;
      }
    }
  }

  //optional: remove disconnected players
  for (const [id] of botsById) {
    if (!seen.has(id)) botsById.delete(id);
  }

  if (phase === "phaseFinished") {
    renderResultsOverlay(players);
  }
}

net.onPlayerSnapshot = (s: PlayerSnapshotMsg) => {
  playerStateById.clear();
  for (const p of s.players) {
    playerStateById.set(p.id, p);
  }
  applyPlayerWireState(s.tick, s.phase, s.phaseEndsAtTick, s.mapChecksum);
};

net.onPlayerDelta = (m: PlayerDeltaMsg) => {
  for (const d of m.deltas) {
    const prev = playerStateById.get(d.id);
    const next = prev ? ({ ...prev } as any) : ({ id: d.id } as any);
    for (const [k, v] of Object.entries(d)) {
      if (k === "id" || v === undefined) continue;
      next[k] = v;
    }
    playerStateById.set(d.id, next as PlayerSnapshotMsg["players"][number]);
  }
  applyPlayerWireState(m.tick, m.phase, m.phaseEndsAtTick, m.mapChecksum);
};

net.onTileMapSnapshot = (s: TileMapSnapshotMsg) => {
  currentPhase = s.phase;

  const receivedAtMs = performance.now()

  clock.updateSnapshot(s.tick, receivedAtMs);
  if (tileMap) {tileMap.setAuthoritativeStateFromTileMapSnapshot(s.tileMap);}
  checksumMismatchStreak = 0;

};

net.onTileChange = (m: TileChangeMsg) => {
  if (!tileMap) return;
  const pos = new Vector2(m.x, m.y);
  tileMap.setTileIndex(pos, m.index);
  if (tileMap.isTileAWall(pos)) {
    audio.playSfx("wall", { volume: 0.5, pitchMin: 0.98, pitchMax: 1.03 });
  }
}

net.onTileInitiateChange = (m: TileInitiateChangeMsg) => {
  if (tileMap) {tileMap.setAuthoritativeInitiateColorChange(new Vector2(m.x, m.y), m.toIndex, m.tileChangeStartTick, m.tileChangeDurTicks);}
  audio.playSfx("tick", { volume: 0.6, pitchMin: 0.98, pitchMax: 1.02 });
}

net.onTileChangeList = (m: TileChangeListMsg) => {
  const tm = tileMap;
  const nowMs = performance.now();
  if (!tm) return;

  // Find source wall tile from this batch
  const wallDelta = m.tileChangeList.find(t =>
    t.index === 6 || t.index === 9 || t.index === 12 || t.index === 15
  );

  let defaultX = 0;
  let defaultY = 0;

  if (wallDelta) {
    defaultX = wallDelta.x;
    defaultY = wallDelta.y;
  }
  tm.setAuthoritativeTileChangeList(m, defaultX, defaultY, nowMs);

  if (m.tileChangeList.length === 0) return;

  const anyFoundation = m.tileChangeList.some(t => tm.isTileAFoundation(new Vector2(t.x, t.y)));
  if (anyFoundation) {
    audio.playSfx("combo", { volume: 0.9 });
    return;
  }

  const anyGarden = m.tileChangeList.some(t => tm.isTileAGarden(new Vector2(t.x, t.y)));
  if (anyGarden) {
    audio.playSfx("garden", { volume: 0.85 });
    
    return;
  }

  const anyWall = m.tileChangeList.some(t => tm.isTileAWall(new Vector2(t.x, t.y)));
  if (anyWall) {
    audio.playSfx("wall", { volume: 0.5, pitchMin: 0.98, pitchMax: 1.03 });
  }
}

net.onSillyPadMsg = (m: SillyPadMsg) => {
  
  console.log("silly pad message received")

  let j = 0;

  if (m.action == "create") {

    let i = botsById.get(m.ownerId)?.getRole();

    if (!i){return}
    switch (i) {
      case "pinkBot": j = 0; break;
      case "goldBot": j = 1; break;
      case "whiteBot": j = 2; break;
      case "blackBot": j = 3; break;
      default: return;
    }
  }

  if (tileMap) {tileMap.setSillyPadFromServerMessage(m, j)};
  if (m.action === "create") {
    audio.playSfx("sillypadlay", { volume: 0.85 });
  }
}

net.onWallbreakerMsg = (m: WallbreakerMsg) => {
  console.log ("wallbreaker message received")

  if (tileMap) {tileMap.sendWallbreakerServerMessage(m)};
  if (m.action === "create") {
    audio.playSfx("item", { volume: 0.85 });
  }
}

net.onConfig = (c) => {
  console.log('server config', c); 
  cols = c.cols;
  rows = c.rows;

  tileMap = new TileMap({
    cols,
    rows,
    tileSize,
    tileSprite,
    sillyPadSprite: sillyPadSprite,
    wallbreakerSprite: wallbreakerSprite,
    getEstimatedTick,
    onExplosionStart: () => {
      audio.playSfx("explosion", { volume: 0.9, pitchMin: 0.97, pitchMax: 1.03 });
    },
  });
  tileMap.rerollWithSeed(c.seed);

  clock.updateConfig(c.tickHz);
}

net.onRoleInvalid = (m) => {
  console.log('role invalid', m);
  //TODO add invalid role selection code
}

new GameLoop(update, render).start();


function spriteForPlayer(role: Role, model: Model): Sprite {
  
  return new Sprite({
    resource: resources.images.bots,
    frameSize: new Vector2(32, 32),
    hFrames:BOT_SHEET.cols,
    vFrames:BOT_SHEET.rows,
    frame: frameForBot(role, model, "down"),
    scale: 1,
  });
}

function spriteForPreview(role: Role, model: Model): Sprite {
  return new Sprite({
    resource: resources.images.bots,
    frameSize: new Vector2(32, 32),
    hFrames: BOT_SHEET.cols,
    vFrames: BOT_SHEET.rows,
    frame: frameForBot(role, model, "down"),
    scale: 2,
  })
}

function update(_dt: number) {
  const nowMs = performance.now();
  updateMusicState();

  switch (currentPhase) {
    case 'phaseLobby': {
      if (!joinedRoomId) break;
      //only allow "ready" on Enter. no other commands
      if (p1.consumeCommands().some(c => c.type === 'actionDown')) {
        if (lobbyState.role) {
          net.sendCommand({ type: 'ready', ready: true, role: lobbyState.role, model: lobbyState.model });
        }
      }
      break;
    } //end if case phaselobby
    case 'phaseCountdown': {
      if (!playedCountdownNumber[3]) { // if it hasn't played the sound for "3" yet, then play it. it should play first-thing
        audio.playSfx("beep", {volume: 0.7, pitchMin: 1, pitchMax: 1})
        playedCountdownNumber[3] = true
      }
      if (secondsLeft <= 2 && !playedCountdownNumber[2]) {
        audio.playSfx("beep", {volume: 0.8, pitchMin: 1, pitchMax: 1})
        playedCountdownNumber[2] = true
      }
      if (secondsLeft <= 1 && !playedCountdownNumber[1]) {
        audio.playSfx("beep", {volume: 0.9, pitchMin: 1, pitchMax: 1})
        playedCountdownNumber[1] = true
      }



      break;
    }
    case 'phasePlaying': {
      if (!playedCountdownNumber[0]) {
        audio.playSfx("bang", {volume: 1, pitchMin: 1, pitchMax: 1})
        playedCountdownNumber[0] = true
      }
      for (const cmd of p1.consumeCommands()) net.sendCommand(cmd);
      const dir = p1.getMoveIntent();          // DirType | null
      if (dir !== lastDir) {
        net.sendCommand({ type: 'input', dir });
        lastDir = dir;
      }
      //TODO call player update here, if needed. (If we make the player's botonoid start to show actions before the server tells it that it happened)
      if (tileMap) {tileMap.update(nowMs)}

      break;
    } //end if case phaseplaying
    case 'phaseFinished': {
      break;
    }
  }
  
}



function render() {
  const nowMs = performance.now();

  ctx.fillStyle = '#313642ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //turn on or off room browser and lobby
  applyOverlayState();

  switch (currentPhase) {
    case 'phaseLobby': {
        if (previewCtx && previewCanvas) {
          previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          let roleToSend = lobbyState.role;
          let modelToSend = lobbyState.model;

          if (!roleToSend) break;

          if (roleToSend == "observer") {
            //TODO draw observer here
          } else if (roleToSend === "randomBot") {
            //cycles every second between the colors
            const index = Math.floor(nowMs / 1000) % 4;
            switch (index) {
              case 0:
                roleToSend = "goldBot";
                break;
              case 1:
                roleToSend = "pinkBot";
                break;
              case 2:
                roleToSend = "whiteBot";
                break;
              default:
                roleToSend = "blackBot";
                break;
            } 
          }

          if (modelToSend == "randomnoid") {
            //cycles every second between the models; offset by a half second from the color cycling
            const index = Math.floor((nowMs+500) / 1000) % 3;
            switch (index) {
              case 0:
                modelToSend = "alphanoid"
                break;
              case 1:
                modelToSend = "herbanoid";
                break;
              default:
                modelToSend = "barvinoid";
                break;
            } 
          }

          if (roleToSend != "observer") {
            const sprite = spriteForPreview(roleToSend, modelToSend);
            const w = 32 * sprite.scale;
            const h = 32 * sprite.scale;
            const x = Math.floor((previewCanvas.width-w)/2);
            const y = Math.floor((previewCanvas.height-h) / 2);
            sprite.drawImage(previewCtx, x, y);
          }
        }

      break;
    }
    case 'phaseCountdown': {
      
      if (tileMap) {tileMap.draw(ctx, nowMs);}

      for (const bot of botsById.values()) {
        bot.draw(ctx, nowMs);
      }

      // draw HUD
      const hudY = Y_DRAW_OFFSET + tileSize * rows
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: secondsLeft, botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});

      const sec = Math.max(1, Math.min(3, secondsLeft));
      const countdownLabel = String(sec);

      drawText(ctx, countdownLabel, canvas.width / 2, canvas.height / 2 - 10, {
        font: '700 176px "Goldman"',
        stroke: '#000',
        strokeWidth: 12,
      });
      
      break;
    }
    
    case 'phasePlaying': {
      if (tileMap) {tileMap.draw(ctx, nowMs);}

      for (const bot of botsById.values()) {
        bot.draw(ctx, nowMs);
      }

      // draw HUD
      const hudY = Y_DRAW_OFFSET + tileSize * rows
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: secondsLeft, botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});

      if (nowMs < goOverlayUntilMs) {
        drawText(ctx, "Go!", canvas.width / 2, canvas.height / 2 - 10, {
          font: '700 160px "Goldman"',
          stroke: '#000',
          strokeWidth: 12,
        });
      }
    
      break;
    }
    case 'phaseFinished': {
      if (tileMap) {tileMap.draw(ctx, nowMs);}
      for (const bot of botsById.values()) {
        bot.draw(ctx, nowMs);
      }
      const hudY = Y_DRAW_OFFSET + tileSize * rows;
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: secondsLeft, botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});
      renderResultsOverlay(latestLobbyPlayers);
      break;
    }
  }
  
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    font?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  } = {}
) {
  ctx.save();
  ctx.font = opts.font ?? '400 21px "Goldman"';
  ctx.fillStyle = opts.fill ?? '#fff';
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.strokeWidth ?? 3;
    ctx.strokeText(text, x, y);
  }
  
  ctx.fillText(text, x, y);
  ctx.restore();
}
