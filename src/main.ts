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
import { initHowToPlay } from "./howToPlay";

import HUD from "./hud";
import { ItemNotifications } from "./itemNotification";

import {frameForBot, BOT_SHEET} from './botonoidSheet'

import { TILE_SIZE, FRAME_SIZE, X_DRAW_OFFSET, Y_DRAW_OFFSET } from './Constants';

import type { DirType } from './protocol';

import KeyboardController, { type KeyMap } from './KeyboardController';
import { P2_KEYS, P2_OFFLINE_KEYS } from './keymaps';
import ServerClock from './ServerClock';
import {
  initOptionsOverlay,
  type ControlsState,
  type MusicChoice,
  type RebindConflict,
} from "./optionsOverlay";
import { LocalGameServer } from './localServer';
import { initOfflineRoomUI } from './offlineRoom';

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
  theme: musicUrl("shooterlandtheme"),
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
  ghost: "/sfx/ghost.wav",
  unghost: "/sfx/unghost.wav",
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
audio.loadSfx("ghost", audioUrls.ghost);
audio.loadSfx("unghost", audioUrls.unghost);
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
const itemNotifs = new ItemNotifications();


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
let lastDir2: DirType | null = null;
let localResultsDismissed = false;
let isOfflineMode = false;
let localServer: LocalGameServer | null = null;
let offlineRoomVisible = false;
let offlineP2Id: number | null = null;
let savedOnlinePlayerId: number | null = null;

type BindingAction = keyof KeyMap;
const BINDING_ACTIONS: BindingAction[] = ["up", "down", "left", "right", "action", "changeItem", "useItem"];
const DEFAULT_KEYMAP: KeyMap = cloneKeyMap(P2_KEYS);
const playerKeyMap: KeyMap = cloneKeyMap(DEFAULT_KEYMAP);
let controlLabels: ControlsState = keyMapToControlsState(playerKeyMap);

const DEFAULT_P2_KEYMAP: KeyMap = cloneKeyMap(P2_OFFLINE_KEYS);
const p2KeyMap: KeyMap = cloneKeyMap(DEFAULT_P2_KEYMAP);
let p2ControlLabels: ControlsState = keyMapToControlsState(p2KeyMap);

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

const howToPlay = initHowToPlay({
  onOpenChange: () => {},
  getControls: () => controlLabels,
});

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
  onHowToPlay: () => {
    howToPlay.open();
  },
  onPlayOffline: () => {
    showOfflineRoom();
  },
});

optionsOverlay = initOptionsOverlay({
  controls: controlLabels,
  p2Controls: p2ControlLabels,
  musicChoice: selectedMusicChoice,
  musicVolume: 1,
  sfxVolume: 1,
  onOpenChange: (open) => {
    optionsOpen = open;
    if (open) {
      setInGameMenuOpen(false);
      if (joinedRoomId !== null && currentPhase === "phasePlaying") {
        sendGameCommand(1, { type: "input", dir: null });
        lastDir = null;
        if (isOfflineMode) { sendGameCommand(2, { type: "input", dir: null }); lastDir2 = null; }
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
      sendGameCommand(1, { type: "input", dir: null });
      lastDir = null;
    }
  },
  onCancelRebind: () => {
    optionsOverlay?.setRebindPending(null);
    optionsOverlay?.setRebindConflict(findFirstBindingConflict(controlLabels));
  },
  onApplyP2Rebind: (action, key) => {
    p2ControlLabels = { ...p2ControlLabels, [action]: key };
    p2KeyMap[action] = variantsForBoundKey(key);
    const conflict = findFirstBindingConflict(p2ControlLabels);
    optionsOverlay?.setP2Controls(p2ControlLabels);
    optionsOverlay?.setP2RebindPending(null);
    optionsOverlay?.setP2RebindConflict(conflict);
  },
  onCancelP2Rebind: () => {
    optionsOverlay?.setP2RebindPending(null);
    optionsOverlay?.setP2RebindConflict(findFirstBindingConflict(p2ControlLabels));
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
      sendGameCommand(1, { type: "input", dir: null });
      lastDir = null;
    }
  },
  onResetP2Controls: () => {
    const defaults = cloneKeyMap(DEFAULT_P2_KEYMAP);
    for (const action of BINDING_ACTIONS) {
      p2KeyMap[action] = [...defaults[action]];
    }
    p2ControlLabels = keyMapToControlsState(p2KeyMap);
    optionsOverlay?.setP2Controls(p2ControlLabels);
    optionsOverlay?.setP2RebindPending(null);
    optionsOverlay?.setP2RebindConflict(findFirstBindingConflict(p2ControlLabels));
  },
});

// ── Offline mode helpers ──────────────────────────────────────────────────────

function sendGameCommand(playerId: number, cmd: Parameters<typeof net.sendCommand>[0]): void {
  if (isOfflineMode && localServer) {
    localServer.sendCommand(playerId, cmd);
  } else if (playerId === 1) {
    net.sendCommand(cmd);
  }
}

function showOfflineRoom(): void {
  offlineRoomVisible = true;
  offlineRoomUI.show();
}

function startOfflineGame(configs: import('./localServer').OfflinePlayerConfig[]): void {
  offlineRoomUI.hide();
  offlineRoomVisible = false;
  isOfflineMode = true;
  savedOnlinePlayerId = net.playerId;
  net.playerId = configs.find(c => c.isHuman)?.id ?? 1;
  offlineP2Id = configs.filter(c => c.isHuman)[1]?.id ?? null;
  joinedRoomId = "offline";
  playerStateById.clear();
  playerMetaById.clear();
  playerStatusById.clear();
  botsById.clear();
  lastDir = null;
  lastDir2 = null;
  localResultsDismissed = false;
  handlePhaseChange("phaseLobby");
  applyOverlayState();

  localServer = new LocalGameServer(configs);
  localServer.start({
    onConfig:               (m) => net.onConfig?.(m),
    onHello:                (m) => { net.playerId = m.playerId; },
    onPlayerSnapshot:       (m) => net.onPlayerSnapshot?.(m),
    onPlayerDelta:          (m) => net.onPlayerDelta?.(m),
    onPlayerMetaSnapshot:   (m) => net.onPlayerMetaSnapshot?.(m),
    onPlayerStatusSnapshot: (m) => net.onPlayerStatusSnapshot?.(m),
    onTileMapSnapshot:      (m) => net.onTileMapSnapshot?.(m),
    onTileChange:           (m) => net.onTileChange?.(m),
    onTileChangeList:       (m) => net.onTileChangeList?.(m),
    onTileInitiateChange:   (m) => net.onTileInitiateChange?.(m),
    onSillyPadMsg:          (m) => net.onSillyPadMsg?.(m),
    onWallbreakerMsg:       (m) => net.onWallbreakerMsg?.(m),
  });
}

function stopOfflineGame(): void {
  localServer?.stop();
  localServer = null;
  isOfflineMode = false;
  offlineRoomVisible = false;
  offlineP2Id = null;
  joinedRoomId = null;
  net.playerId = savedOnlinePlayerId;
  savedOnlinePlayerId = null;
  playerStateById.clear();
  playerMetaById.clear();
  playerStatusById.clear();
  botsById.clear();
  lastDir = null;
  lastDir2 = null;
  // Don't null tileMap — the online server won't resend onConfig (WebSocket stays connected),
  // so applyPlayerWireState would bail early and bots/tiles would never render.
  // The online server's onTileMapSnapshot will repopulate tile data when the next game starts.
  handlePhaseChange("phaseLobby");
  applyOverlayState();
}

const offlineRoomUI = initOfflineRoomUI({
  onStart: (configs) => startOfflineGame(configs),
  onBack: () => {
    offlineRoomUI.hide();
    offlineRoomVisible = false;
  },
});

function applyOverlayState() {
  roomsBrowserUI.setVisible(!joinedRoomId && !offlineRoomVisible);
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
let currentPhaseEndsAtTick = 0;

const getEstimatedTick = clock.estimatedTick.bind(clock);
//const tileMap = new TileMap({cols, rows, tileSize: TILE_SIZE, tileSprite, getEstimatedTick });

// ------ Controllers ------
const p1 = new KeyboardController(playerKeyMap, window, {
  isEnabled: () => joinedRoomId !== null && currentPhase === 'phasePlaying' && !pauseMenuOpen && !optionsOpen,
});

const p2 = new KeyboardController(p2KeyMap, window, {
  isEnabled: () => isOfflineMode && joinedRoomId !== null && currentPhase === 'phasePlaying' && !pauseMenuOpen && !optionsOpen,
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
    sendGameCommand(net.playerId ?? 1, { type: "input", dir: null });
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
    if (isOfflineMode) {
      stopOfflineGame();
    } else if (joinedRoomId) {
      net.sendCommand({ type: "roomLeave" });
    }
  });
}

if (resultsOkBtn) {
  resultsOkBtn.addEventListener("click", () => {
    if (!joinedRoomId || currentPhase !== "phaseFinished") return;
    if (isOfflineMode) {
      stopOfflineGame();
    } else {
      net.sendCommand({ type: "resultsOk" });
      resultsOkBtn.disabled = true;
    }
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
    itemNotifs.clear();
  }
  if (prevPhase === "phaseCountdown" && next === "phasePlaying") {
    goOverlayUntilMs = performance.now() + 700;
  }
  if (next === "phaseFinished" && prevPhase !== "phaseFinished") {
    sendGameCommand(net.playerId ?? 1, { type: "input", dir: null });
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
  if (!joinedRoomId) {
    handlePhaseChange("phaseLobby");
  }
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
  handlePhaseChange("phaseLobby");
  joinedRoomId = m.roomId;
  lobbyUI.resetSelection();
  roomsBrowserUI.setError("");
  requestRoomsList();
  applyOverlayState();
};

net.onRoomJoinOk = (m) => {
  handlePhaseChange("phaseLobby");
  joinedRoomId = m.roomId;
  lobbyUI.resetSelection();
  roomsBrowserUI.setError("");
  requestRoomsList();
  applyOverlayState();
};

net.onRoomLeaveOk = () => {
  handlePhaseChange("phaseLobby");
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
  currentPhaseEndsAtTick = phaseEndsAtTick;

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

    const wasGhost = bot.getMode() === "ghost";
    bot.setAuthoritativeStateFromPlayerSnapshot(p);
    const isGhost = bot.getMode() === "ghost";
    if (!wasGhost && isGhost) {
      audio.playSfx("ghost", { volume: 0.9, pitchMin: 1, pitchMax: 1 });
    }
    if (wasGhost && !isGhost) {
      audio.playSfx("unghost", { volume: 0.9, pitchMin: 1, pitchMax: 1 });
    }
    
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
  const nowMs = performance.now();
  for (const d of m.deltas) {
    const prev = playerStateById.get(d.id);

    // Detect item count increases for floating notifications
    if (prev) {
      const sillyDelta = (d.numSillyPadsLeft ?? prev.numSillyPadsLeft) - prev.numSillyPadsLeft;
      const wbDelta = (d.numWallbreakersLeft ?? prev.numWallbreakersLeft) - prev.numWallbreakersLeft;
      if (sillyDelta > 0 || wbDelta > 0) {
        const bot = botsById.get(d.id);
        if (bot) {
          const center = bot.getDrawCenterPx(nowMs);
          if (sillyDelta > 0) itemNotifs.add(center.x - 10, center.y, nowMs, 0, `+${sillyDelta}`);
          if (wbDelta > 0) itemNotifs.add(center.x + 10, center.y + (sillyDelta > 0 ? 14 : 0), nowMs, 1, `+${wbDelta}`);
        }
      }
    }

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
  handlePhaseChange(s.phase);

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
      const p1Id = net.playerId ?? 1;
      for (const cmd of p1.consumeCommands()) sendGameCommand(p1Id, cmd);
      const dir = p1.getMoveIntent();          // DirType | null
      if (dir !== lastDir) {
        sendGameCommand(p1Id, { type: 'input', dir });
        lastDir = dir;
      }
      if (isOfflineMode && offlineP2Id !== null) {
        for (const cmd of p2.consumeCommands()) sendGameCommand(offlineP2Id, cmd);
        const dir2 = p2.getMoveIntent();
        if (dir2 !== lastDir2) {
          sendGameCommand(offlineP2Id, { type: 'input', dir: dir2 });
          lastDir2 = dir2;
        }
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
      drawMatchPlayfield(nowMs);
      drawCountdownSpotlight(nowMs);

      // draw HUD
      const hudY = Y_DRAW_OFFSET + tileSize * rows
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: Math.ceil(clock.ticksToSeconds(Math.max(0, currentPhaseEndsAtTick - getEstimatedTick(nowMs)))), botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});

      const liveTicksLeft = Math.max(0, currentPhaseEndsAtTick - getEstimatedTick(nowMs));
      const liveSecondsLeft = clock.ticksToSeconds(liveTicksLeft);
      const sec = Math.max(1, Math.min(3, Math.ceil(liveSecondsLeft)));
      const countdownLabel = String(sec);

      drawText(ctx, countdownLabel, canvas.width / 2, canvas.height / 2 - 10, {
        font: '700 176px "Goldman"',
        stroke: '#000',
        strokeWidth: 12,
      });
      
      break;
    }
    
    case 'phasePlaying': {
      drawMatchPlayfield(nowMs);

      // draw HUD
      const hudY = Y_DRAW_OFFSET + tileSize * rows
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: Math.ceil(clock.ticksToSeconds(Math.max(0, currentPhaseEndsAtTick - getEstimatedTick(nowMs)))), botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});

      if (nowMs < goOverlayUntilMs) {
        drawText(ctx, "Go!", canvas.width / 2, canvas.height / 2 - 10, {
          font: '700 176px "Goldman"',
          stroke: '#000',
          strokeWidth: 12,
        });
      }
    
      break;
    }
    case 'phaseFinished': {
      drawMatchPlayfield(nowMs);
      const hudY = Y_DRAW_OFFSET + tileSize * rows;
      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: Math.ceil(clock.ticksToSeconds(Math.max(0, currentPhaseEndsAtTick - getEstimatedTick(nowMs)))), botsById, localPlayerId: net.playerId, numActivePlayers, nowMs});
      renderResultsOverlay(latestLobbyPlayers);
      break;
    }
  }
  
}

function drawMatchPlayfield(nowMs: number): void {
  if (!tileMap) {
    return;
  }

  tileMap.drawBackground(ctx, nowMs);

  const botsByRow: Botonoid[][] = Array.from({ length: Math.max(0, rows) }, () => []);
  for (const bot of botsById.values()) {
    const row = Math.min(rows - 1, bot.getDrawRow(nowMs));
    if (row < 0) {
      continue;
    }
    botsByRow[row].push(bot);
  }

  for (let row = 0; row < rows; row++) {
    tileMap.drawRowSillyPads(ctx, nowMs, row);

    const bots = botsByRow[row];
    bots.sort((a, b) => a.getId() - b.getId());
    for (const bot of bots) {
      bot.draw(ctx, nowMs); // includes bot numbers/overlay
    }

    tileMap.drawRowBombs(ctx, nowMs, row);
  }

  tileMap.drawExplosions(ctx, nowMs);

  // Floating item-earned notifications
  const itemsImgRef = resources.images.items;
  itemNotifs.draw(ctx, nowMs, itemsImgRef.isLoaded ? itemsImgRef.image : null);
}

function drawCountdownSpotlight(nowMs: number): void {
  if (currentPhase !== "phaseCountdown" || cols <= 0 || rows <= 0) {
    return;
  }

  const humanIds: number[] = [];
  if (net.playerId !== null) humanIds.push(net.playerId);
  if (isOfflineMode && offlineP2Id !== null) humanIds.push(offlineP2Id);
  if (humanIds.length === 0) return;

  const centers = humanIds
    .map(id => botsById.get(id))
    .filter(b => b && b.getRole() !== "observer")
    .map(b => b!.getDrawCenterPx(nowMs));
  if (centers.length === 0) return;

  const playfieldX = X_DRAW_OFFSET;
  const playfieldY = Y_DRAW_OFFSET;
  const playfieldW = cols * tileSize;
  const playfieldH = rows * tileSize;

  // Compute per-center final radii, then use max as the shared expansion radius.
  const finalRadius = Math.max(...centers.map(center => Math.max(
    Math.hypot(center.x - playfieldX, center.y - playfieldY),
    Math.hypot(center.x - (playfieldX + playfieldW), center.y - playfieldY),
    Math.hypot(center.x - playfieldX, center.y - (playfieldY + playfieldH)),
    Math.hypot(center.x - (playfieldX + playfieldW), center.y - (playfieldY + playfieldH)),
  ))) + 4;

  const baseRadius = 40;
  const ticksLeft = Math.max(0, currentPhaseEndsAtTick - getEstimatedTick(nowMs));
  const preciseSecondsLeft = clock.ticksToSeconds(ticksLeft);

  let radius = baseRadius;
  if (preciseSecondsLeft <= 1) {
    const t = Math.max(0, Math.min(1, 1 - preciseSecondsLeft));
    const rapid = t * t;
    radius = baseRadius + (finalRadius - baseRadius) * rapid;
  }

  // Use an offscreen canvas so destination-out only punches holes in the overlay
  // layer, not in the game tiles already drawn on the main canvas.
  const offscreen = new OffscreenCanvas(playfieldW, playfieldH);
  const octx = offscreen.getContext('2d')!;
  octx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  octx.fillRect(0, 0, playfieldW, playfieldH);
  octx.globalCompositeOperation = 'destination-out';
  octx.fillStyle = 'rgba(0, 0, 0, 1)';
  for (const center of centers) {
    octx.beginPath();
    octx.arc(center.x - playfieldX, center.y - playfieldY, radius, 0, Math.PI * 2);
    octx.fill();
  }
  ctx.drawImage(offscreen, playfieldX, playfieldY);
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
