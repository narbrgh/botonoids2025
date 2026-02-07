import NetClient from './net/NetClient';

import { GameLoop } from './GameLoop';
import { Sprite } from './Sprite';
import Vector2 from './Vector2';
import { resources } from './Resources';
import TileMap from './TileMap';
import Botonoid from './Botonoid';
import type { PlayerSnapshotMsg, TileMapSnapshotMsg, TileChangeMsg , TileInitiateChangeMsg, TileChangeListMsg} from './protocol'
import type { Phase , Role , Model } from './protocol';
import {initLobbyUI, lobbyState } from "./lobby";

import HUD from "./hud";

import {frameForBot, BOT_SHEET} from './botonoidSheet'

import { TILE_SIZE, FRAME_SIZE, MOVE_DURATION_MS, Y_DRAW_OFFSET} from './Constants';

import type { DirType, InputCmd } from './protocol';

import KeyboardController from './KeyboardController';
import { P1_KEYS, P2_KEYS } from './keymaps';
import ServerClock from './ServerClock';

import './style.css'
//import type { Command } from './commands';


//Set up main canvas element
const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas = canvasEl;

const ctxEl = canvas.getContext('2d');
if (!ctxEl) throw new Error('2D context not available');
const ctx = ctxEl;

ctx.imageSmoothingEnabled = false

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
initLobbyUI((e) => {
  if (e.type === "ready") {
        net.sendCommand({ type: 'ready', role: lobbyState.role, model: lobbyState.model });
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

const tileSprite = new Sprite({
  resource: resources.images.tiles,
  frameSize: new Vector2(FRAME_SIZE, FRAME_SIZE),
  hFrames: 1,
  vFrames: 17,
  frame: 0,
  scale: TILE_SIZE / FRAME_SIZE, // keep this an integer for pixel art
});

const clock = new ServerClock();
let secondsLeft = 540;

const getEstimatedTick = clock.estimatedTick.bind(clock);
//const tileMap = new TileMap({cols, rows, tileSize: TILE_SIZE, tileSprite, getEstimatedTick });

// ------ Controllers ------
const p1 = new KeyboardController(P2_KEYS); // TODO make it make sense. currently lazily using P2_KEYS because those are arrow keys, instead of changing the file

// ----- MAP of players ----

const botsById = new Map<number, Botonoid>();

const net = new NetClient();
net.connect();

let currentPhase: Phase = 'phaseLobby'
let prevPhase: Phase = currentPhase;

function handlePhaseChange(next: Phase) {
  if (prevPhase === 'phaseLobby' && next === 'phaseCountdown') {
    //update the frames for the botonoid sprite graphics based on role and model
   //maybe?? 
  }
  prevPhase = next;
  currentPhase = next;
}

net.onPlayerSnapshot = (s: PlayerSnapshotMsg) => {

  currentPhase = s.phase;
  const receivedAtMs = performance.now()
  const seen = new Set<number>();
  const ticksLeft = Math.max(0, s.phaseEndsAtTick - s.tick);
  secondsLeft = Math.ceil(clock.ticksToSeconds(ticksLeft));


  for (const p of s.players) {
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

    bot.setAuthoritativeStateFromPlayerSnapshot(p);
    
  }

  clock.updateSnapshot(s.tick, receivedAtMs);

  //optional: remove disconnected players
  for (const [id] of botsById) {
    if (!seen.has(id)) botsById.delete(id);
  }
};

net.onTileMapSnapshot = (s: TileMapSnapshotMsg) => {
  currentPhase = s.phase;

  const receivedAtMs = performance.now()

  clock.updateSnapshot(s.tick, receivedAtMs);
  if (tileMap) {tileMap.setAuthoritativeStateFromTileMapSnapshot(s.tileMap);}

};

net.onTileChange = (m: TileChangeMsg) => {
  if (tileMap) {tileMap.setTileIndex(new Vector2(m.x, m.y), m.index);}
}

net.onTileInitiateChange = (m: TileInitiateChangeMsg) => {
  if (tileMap) {tileMap.setAuthoritativeInitiateColorChange(new Vector2(m.x, m.y), m.toIndex, m.tileChangeStartTick, m.tileChangeDurTicks);}
}

net.onTileChangeList = (m: TileChangeListMsg) => {
  if (tileMap) {tileMap.setAuthoritativeTileChangeList(m)}
}

net.onConfig = (c) => {
  console.log('server config', c); 
  cols = c.cols;
  rows = c.rows;

  tileMap = new TileMap({ cols, rows, tileSize, tileSprite, getEstimatedTick });
  tileMap.rerollWithSeed(c.seed);

  clock.updateConfig(c.tickHz);
}

net.onRoleInvalid = (m) => {
  console.log('role invalid', m);
  //TODO add invalid role selection code
}

let lastDir: DirType | null = null;

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

function drivePlayer(controller: KeyboardController, player: Botonoid, dt: number) {
  // buttons (action/changeItem/useItem) — Botonoid ignores for now, but you’ll later route these
  for (const cmd of controller.consumeCommands()) {
    net.sendCommand(cmd);
    if (cols > 0 && rows > 0) {
      player.applyCommand(cmd, cols, rows);// optional local behavior for now
    }
  }

  // movement intent: only start a move when idle
  if (!player.isMoving()) {
    const dir = controller.getMoveIntent();
    if (dir) {
      const cmd = { type: 'move', dir } as const;
      net.sendCommand(cmd);
      if (cols > 0 && rows > 0) {
        player.applyCommand({ type: 'move', dir }, cols, rows); // optional local behavior for now
      }
    }
  }

  player.update(dt);
}

function update(dt: number) {
  const nowMs = performance.now();

  switch (currentPhase) {
    case 'phaseLobby': {
      //only allow "ready" on Enter. no other commands
      if (p1.consumeCommands().some(c => c.type === 'actionDown')) {
        net.sendCommand({ type: 'ready', role: lobbyState.role, model: lobbyState.model });
      }
      break;
    } //end if case phaselobby
    case 'phasePlaying': {
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
  }
  
}



function render() {
  const nowMs = performance.now();

  ctx.fillStyle = '#313642ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //turn on or off the lobby GUI depending on current phase
  lobby.style.display = (currentPhase === 'phaseLobby') ? "flex" : "none";

  switch (currentPhase) {
    case 'phaseLobby': {
        if (previewCtx && previewCanvas) {
          previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          let roleToSend = lobbyState.role;
          let modelToSend = lobbyState.model;

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
                roleToSend = "silverBot";
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

      drawText(ctx, '3 2 1 GO', canvas.width/2, canvas.height/2, {
        font: '400 88 px "Goldman"',
        stroke: '#000',
        strokeWidth: 8,
      });
      
      break;
    }
    
    case 'phasePlaying': {
      if (tileMap) {tileMap.draw(ctx, nowMs);}

      for (const bot of botsById.values()) {
        bot.draw(ctx, nowMs);
      }

      // draw HUD
      //***
      drawText(ctx, String(secondsLeft), 100, 100);
      const hudY = Y_DRAW_OFFSET + tileSize * rows

      hud.draw({x: 0, y: hudY, width: canvas.width, height: canvas.height - hudY, timeLeft: secondsLeft, botsById, localPlayerId: net.playerId});
    
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