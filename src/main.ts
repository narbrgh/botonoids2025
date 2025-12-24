import { GameLoop } from './GameLoop';
import { Sprite } from './Sprite';
import Vector2 from './Vector2';
import { resources } from './Resources';
import TileMap from './TileMap';
import Input from './Input';
import type { Command } from './commands'
import Botonoid from './Botonoid';
import { P1_KEYS, P2_KEYS } from './keymaps';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas = canvasEl;

const ctxEl = canvas.getContext('2d');
if (!ctxEl) throw new Error('2D context not available');
const ctx = ctxEl;

ctx.imageSmoothingEnabled = false;

// Botonoid sprite uses the shared resource bucket
const botonoidSprite = new Sprite({
  resource: resources.images.goldBot,
  frameSize: new Vector2(32, 32),
  hFrames: 1,
  vFrames: 4,
  frame: 2,
  scale: 1,
});

const TILE_SIZE = 32;
const FRAME_SIZE = 32;

const player = new Botonoid({
  tileX: 5,
  tileY: 5,
  tileSize: TILE_SIZE,
  sprite: botonoidSprite,
});

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

const input = new Input();

const update = (_dt: number) => {
  const cmds: Command[] = input.consumeCommands();

  for (const cmd of cmds) {
    if (cmd.type === 'move') {
      player.applyCommand(cmd, cols, rows)
    }
  }
  player.update(_dt);
};

const render = () => {
  ctx.fillStyle = '#1e66ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tileMap.draw(ctx);
  player.draw(ctx);
}

new GameLoop(update, render).start();

