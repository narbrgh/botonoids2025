import NetClient from './net/NetClient';

import { GameLoop } from './GameLoop';
import { Sprite } from './Sprite';
import Vector2 from './Vector2';
import { resources } from './Resources';
import TileMap from './TileMap';
import Botonoid from './Botonoid';
import type { PlayerSnapshotMsg, TileMapSnapshotMsg, TileChangeMsg , TileInitiateChangeMsg, TileChangeListMsg} from './protocol'

import { TILE_SIZE, FRAME_SIZE, MOVE_DURATION_MS} from './Constants';

import type { DirType, InputCmd } from './protocol';

import KeyboardController from './KeyboardController';
import { P1_KEYS, P2_KEYS } from './keymaps';
import ServerClock from './ServerClock';

import './style.css'
//import type { Command } from './commands';


const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas = canvasEl;

const ctxEl = canvas.getContext('2d');
if (!ctxEl) throw new Error('2D context not available');
const ctx = ctxEl;

ctx.imageSmoothingEnabled = false;

const cols = Math.floor(canvas.width / TILE_SIZE);
const rows = Math.floor(canvas.height / TILE_SIZE);

const tileSprite = new Sprite({
  resource: resources.images.tiles,
  frameSize: new Vector2(FRAME_SIZE, FRAME_SIZE),
  hFrames: 1,
  vFrames: 11,
  frame: 0,
  scale: TILE_SIZE / FRAME_SIZE, // keep this an integer for pixel art
});

const clock = new ServerClock();

const getEstimatedTick = clock.estimatedTick.bind(clock);
const tileMap = new TileMap({cols, rows, tileSize: TILE_SIZE, tileSprite, getEstimatedTick });

// Players
const goldSprite = new Sprite({
  resource: resources.images.goldBot,
  frameSize: new Vector2(32, 32),
  hFrames: 1,
  vFrames: 4,
  frame: 2,
  scale: 1,
});

const silverSprite = new Sprite({
  resource: resources.images.silverBot,
  frameSize: new Vector2(32, 32),
  hFrames: 1,
  vFrames: 4,
  frame: 2,
  scale: 1,
});

// ------ Controllers ------
const p1 = new KeyboardController(P2_KEYS); // TODO make it make sense. currently lazily using P2_KEYS because those are arrow keys, instead of changing the file

// ----- MAP of players ----

const botsById = new Map<number, Botonoid>();

function spriteForPlayer(skin: 'gold' | 'silver'): Sprite {
  // simplest: odd = gold, even = silver
  return new Sprite({
    resource: skin === 'gold' ? resources.images.goldBot : resources.images.silverBot,
    frameSize: new Vector2(32, 32),
    hFrames:1,
    vFrames:4,
    frame: 2,
    scale: 1,
  });
}

const net = new NetClient();
net.connect();

net.onPlayerSnapshot = (s: PlayerSnapshotMsg) => {
  const receivedAtMs = performance.now()
  const seen = new Set<number>();

  for (const p of s.players) {
    seen.add(p.id);

    let bot = botsById.get(p.id);
    if (!bot) {
      bot = new Botonoid({
        tileX: p.x,
        tileY: p.y,
        tileSize: TILE_SIZE,
        sprite: spriteForPlayer(p.id % 2 === 1 ? 'gold' : 'silver'), //TODO when lobby is implemented, allow players to choose their sprite
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
  const receivedAtMs = performance.now()
  console.log("net.onTileMapSnapshot");

  clock.updateSnapshot(s.tick, receivedAtMs);
  tileMap.setAuthoritativeStateFromTileMapSnapshot(s.tileMap);

};

net.onTileChange = (m: TileChangeMsg) => {
  tileMap.setTileIndex(new Vector2(m.x, m.y), m.index);
}

net.onTileInitiateChange = (m: TileInitiateChangeMsg) => {
  tileMap.setAuthoritativeInitiateColorChange(new Vector2(m.x, m.y), m.toIndex, m.tileChangeStartTick, m.tileChangeDurTicks);
}

net.onTileChangeList = (m: TileChangeListMsg) => {
  tileMap.setAuthoritativeTileChangeList(m)
}

net.onConfig = (c) => {
  console.log('server config', c); 
  tileMap.rerollWithSeed(c.seed);
  clock.updateConfig(c.tickHz);
}




function drivePlayer(controller: KeyboardController, player: Botonoid, dt: number) {

  // buttons (action/changeItem/useItem) — Botonoid ignores for now, but you’ll later route these
  for (const cmd of controller.consumeCommands()) {
    net.sendCommand(cmd);
    player.applyCommand(cmd, cols, rows);// optional local behavior for now
  }

  // movement intent: only start a move when idle
  if (!player.isMoving()) {
    const dir = controller.getMoveIntent();
    if (dir) {
      const cmd = { type: 'move', dir } as const;
      net.sendCommand(cmd);
      player.applyCommand({ type: 'move', dir }, cols, rows); // optional local behavior for now
    }
  }

  player.update(dt);

}

//let nextMoveAllowedAtMs = 0;

let lastDir: DirType | null = null;

const update = (dt: number) => {
  const nowMs = performance.now();
  for (const cmd of p1.consumeCommands()) net.sendCommand(cmd);

  const dir = p1.getMoveIntent();          // DirType | null

  if (dir !== lastDir) {
    net.sendCommand({ type: 'input', dir });
    lastDir = dir;
  }

  //TODO call player update here, if needed. (If we make the player's botonoid start to show actions before the server tells it that it happened)

  tileMap.update(nowMs)

};
/*
const update = (dt: number) => {
  // Only send commands; don't move local bots here.
  for (const cmd of p1.consumeCommands()) {
    net.sendCommand(cmd);
  }

  // add a "throttle" so it only send move commands if it thinks it can move
  const now = performance.now();
  if (now < nextMoveAllowedAtMs) return;

  // movement intent
  const dir = p1.getMoveIntent();
  if (dir) net.sendCommand({ type: 'move', dir });
  
  nextMoveAllowedAtMs = now + MOVE_DURATION_MS;
};
*/


const render = () => {
  const nowMs = performance.now();

  ctx.fillStyle = '#313642ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tileMap.draw(ctx, nowMs);

  for (const bot of botsById.values()) {
    bot.draw(ctx, nowMs);
  }

}

new GameLoop(update, render).start();


