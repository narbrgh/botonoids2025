import { GameLoop } from './GameLoop';
import { Sprite } from './Sprite';
import Vector2 from './Vector2';
import { resources } from './Resources';
import TileMap from './TileMap';
import Botonoid from './Botonoid';

import KeyboardController from './KeyboardController';
import { P1_KEYS, P2_KEYS } from './keymaps';
import type { Command } from './commands';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas = canvasEl;

const ctxEl = canvas.getContext('2d');
if (!ctxEl) throw new Error('2D context not available');
const ctx = ctxEl;

ctx.imageSmoothingEnabled = false;

const TILE_SIZE = 32;
const FRAME_SIZE = 32;

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

const tileMap = new TileMap({cols, rows, tileSize: TILE_SIZE, tileSprite });

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

const player1 = new Botonoid({
  tileX: 5,
  tileY: 5,
  tileSize: TILE_SIZE,
  sprite: goldSprite,
});

const player2 = new Botonoid({
  tileX: 5,
  tileY: 15,
  tileSize: TILE_SIZE,
  sprite: silverSprite,
});

// ------ Controllers ------
const p1 = new KeyboardController(P1_KEYS);
const p2 = new KeyboardController(P2_KEYS);

function drivePlayer(controller: KeyboardController, player: Botonoid, dt: number) {

  // buttons (action/changeItem/useItem) — Botonoid ignores for now, but you’ll later route these
  for (const cmd of controller.consumeCommands()) {
    player.applyCommand(cmd, cols, rows);
  }

  // movement intent: only start a move when idle
  if (!player.isMoving()) {
    const dir = controller.getMoveIntent();
    if (dir) {
      player.applyCommand({ type: 'move', dir }, cols, rows);
    }
  }

  player.update(dt);

}

const update = (_dt: number) => {
  drivePlayer(p1, player1, _dt);
  drivePlayer(p2, player2, _dt);
};

const render = () => {
  ctx.fillStyle = '#1e66ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tileMap.draw(ctx);
  player1.draw(ctx);
  player2.draw(ctx);
}

new GameLoop(update, render).start();

