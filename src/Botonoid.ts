import Vector2 from './Vector2';
import { Sprite } from './Sprite';
import type { Command } from './commands';
import { MOVE_DURATION_MS, MAX_TILES_COLOR_CHANGE } from './Constants';

import type { TileActions, ColorChangeResult } from './TileMap';

type Dir = 'up' | 'down' | 'left' | 'right';
type BotonoidMode = 'normal' | 'colorChanging' | 'wallBuilding' | 'coolDown';


type MoveState = {
    fromPx: Vector2;
    toPx: Vector2;
    elapsedMs: number;
    durationMs: number;
    targetTile: Vector2;
}

export default class Botonoid {
  // Tile position (integers). 
  // Current tile (integer). This becomes the *committed* tile when a move finishes
  tilePos: Vector2;

  //direction facing
  private facing: Dir = 'down';

  //mode
  private mode: BotonoidMode = 'normal';
  private numColorChanges: number = 0;
  private cooldownMsRemaining = 0;

  // Pixel position (derived)
  readonly tileSize: number;
  readonly sprite: Sprite;
  
  private moveState: MoveState | null = null;

  private readonly tiles: TileActions;


  constructor(opts: { tileX: number; tileY: number; tileSize: number; sprite: Sprite; tileActions: TileActions}) {
    this.tilePos = new Vector2(opts.tileX, opts.tileY);
    this.tileSize = opts.tileSize;
    this.sprite = opts.sprite;
    this.tiles = opts.tileActions;
  }

  //lets main.ts (or others) know if the botonoid is moving or not
  isMoving(): boolean {
    return this.moveState !== null;
  }

  applyCommand(cmd: Command, cols: number, rows: number): void {
    if (cmd.type === 'action') {this.handleAction(); return;}
    
    if (cmd.type !== 'move') return; // for now, we are only programming move commands

    //ignore move commands while already moving
    if (this.moveState) return;

    this.facing = cmd.dir;
    this.sprite.frame = Botonoid.dirToFrame(this.facing);

    const {dx, dy} = Botonoid.dirToDelta(cmd.dir);
    const nextTileX = this.tilePos.x + dx;
    const nextTileY = this.tilePos.y + dy;

    // bounds check (later: collision check against tile map)
    if (nextTileX < 0 || nextTileX >= cols || nextTileY < 0 || nextTileY >= rows) {
        return;
    }

    const fromPx = new Vector2(this.tilePos.x * this.tileSize, this.tilePos.y * this.tileSize); //TODO add grid offset
    const toPx = new Vector2(nextTileX * this.tileSize, nextTileY*this.tileSize); //TODO add grid offset

    this.moveState = {
        fromPx,
        toPx,
        elapsedMs: 0,
        durationMs: MOVE_DURATION_MS, // 1/2 second
        targetTile: new Vector2(nextTileX, nextTileY),
    };
  }

  private static dirToFrame(dir: Dir): number {
    switch (dir) {
      case 'down': return 2;
      case 'left': return 1;
      case 'right': return 3;
      case 'up': return 0;
    }
  }

  update(dtMs: number): void {
    if (!this.moveState) return;
    this.moveState.elapsedMs += dtMs;

    if (this.moveState.elapsedMs >= this.moveState.durationMs) {
      //commit the tile move at the end
      this.tilePos.copy(this.moveState.targetTile);
      this.moveState = null;

      //check if mode is colorchanging, and, if so, try to change a color
      if (this.getMode() === 'colorChanging') {
        let result: ColorChangeResult = this.tiles.initiateColorChange(this.tilePos.clone()); // clone is nice to avoid accidental mutation
        switch (result) {
          case 'colorChangeSuccessful': this.decrementNumColorChanges();
          case 'colorChangeUnsuccessfulDoNotDecrementNumber': break;
          case 'colorChangeUnsuccessfulStillDecrementNumber': this.decrementNumColorChanges();
        }
      }
    }
  }

  private decrementNumColorChanges(): void {
    this.numColorChanges -= 1;
    if (this.numColorChanges <= 0) {
      //TODO enter cooldown
      console.log("enter cooldown");
    }
  }

  // Optional helper for later collision constraints
  clampToBounds(cols: number, rows: number): void {
    this.tilePos.x = Math.max(0, Math.min(cols - 1, this.tilePos.x));
    this.tilePos.y = Math.max(0, Math.min(rows - 1, this.tilePos.y));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const p = this.getDrawPx();
    this.sprite.drawImage(ctx, p.x, p.y);
  }

  private getDrawPx(): Vector2 {
    if (!this.moveState) {
        return new Vector2(this.tilePos.x*this.tileSize, this.tilePos.y*this.tileSize); //TODO add grid offset
    }   
    
    const t = Math.max(0, Math.min(1, this.moveState.elapsedMs / this.moveState.durationMs));
    const x = this.moveState.fromPx.x + (this.moveState.toPx.x - this.moveState.fromPx.x) * t;
    const y = this.moveState.fromPx.y + (this.moveState.toPx.y - this.moveState.fromPx.y) * t;
    return new Vector2(x, y);
        
    }
  
    private static dirToDelta(dir: 'up' | 'down' | 'left' | 'right'): { dx: number; dy: number } {
    switch (dir) {
      case 'up': return { dx: 0, dy: -1 };
      case 'down': return { dx: 0, dy: 1 };
      case 'left': return { dx: -1, dy: 0 };
      case 'right': return { dx: 1, dy: 0 };
    }
  }

  //mode Getter
  getMode(): BotonoidMode {
    return this.mode;
  }

  private handleAction(): void {
    console.log("handleAction");
    switch (this.mode) {
      case 'normal':
        this.mode = 'colorChanging';
        this.numColorChanges = MAX_TILES_COLOR_CHANGE;
        return;
      case 'wallBuilding':
        this.tryToBuildWall();
        return;
    }
  }

  private tryToBuildWall(): void {
    //TODO implement wall building logic
  }
 
}