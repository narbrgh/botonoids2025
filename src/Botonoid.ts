import Vector2 from './Vector2';
import { Sprite } from './Sprite';
import type { Command } from './commands';
import { MOVE_DURATION_MS, MAX_TILES_COLOR_CHANGE, SERVER_TICK_MS, SERVER_TICK_HZ } from './Constants';

import type { TileActions, ColorChangeResult } from './TileMap';

import type {SnapshotPlayer, DirType, BotonoidMode} from './protocol'


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
  private facing: DirType = 'down';

  //mode
  private mode: BotonoidMode = 'walking';
  private numColorChangesLeft: number = 0;
  private numWallsLeft: number = 0;
  private cooldownStartTick: number = 0;
  private cooldownDurTicks: number = 0;

  // Pixel position (derived)
  readonly tileSize: number;
  readonly sprite: Sprite;
  
  private moveState: MoveState | null = null;

  private readonly tiles: TileActions;
  private readonly getEstimatedTick: (nowMs: number) => number;


  // authoritative move field (for the server to tell the Botonoid to start a "tilewalk")
  private auth = {
    x: 0,
    y: 0,
    facing: 'down' as DirType,
    moving: false,
    fromX: 0, fromY: 0,
    toX: 0, toY: 0,
    moveStartTick: 0,
    moveDurTicks: 0,
  };

  constructor(opts: { tileX: number; tileY: number; tileSize: number; sprite: Sprite; tileActions: TileActions; getEstimatedTick: (nowMs: number) => number}) {
    this.tilePos = new Vector2(opts.tileX, opts.tileY);
    this.tileSize = opts.tileSize;
    this.sprite = opts.sprite;
    this.tiles = opts.tileActions;
    this.getEstimatedTick = opts.getEstimatedTick;
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

    // bounds check (TODO collision check against tile map)
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

  private static dirToFrame(dir: DirType): number {
    switch (dir) {
      case 'down': return 2;
      case 'left': return 1;
      case 'right': return 3;
      case 'up': return 0;
    }
  }

  update(dtMs: number): void {
    console.log("update in botonoid");
    if (!this.moveState) return;
    this.moveState.elapsedMs += dtMs;

    if (this.moveState.elapsedMs >= this.moveState.durationMs) {
      //commit the tile move at the end
      this.tilePos.copy(this.moveState.targetTile);
      this.moveState = null;

      //check if mode is colorchanging, and, if so, try to change a color
      console.log("Checking color change");
      if (this.getMode() === 'colorChanging') {
        let result: ColorChangeResult = this.tiles.initiateColorChange(this.tilePos.clone()); // clone is nice to avoid accidental mutation
        switch (result) {
          case 'colorChangeSuccessful': this.decrementNumColorChanges(); break;
          case 'colorChangeUnsuccessfulDoNotDecrementNumber': break;
          case 'colorChangeUnsuccessfulStillDecrementNumber': this.decrementNumColorChanges(); break;
        }
      }
    }
  }

  setAuthoritativeStateFromPlayerSnapshot(p: SnapshotPlayer) {

    //auth is JUST For movement code and smoothing it out
    this.auth.x = p.x;
    this.auth.y = p.y;
    this.auth.facing = p.facing;
    this.auth.moving = p.moving;
    this.auth.fromX = p.fromX;
    this.auth.fromY = p.fromY;
    this.auth.toX = p.toX;
    this.auth.toY = p.toY;
    this.auth.moveStartTick = p.moveStartTick;
    this.auth.moveDurTicks = p.moveDurTicks;

    this.mode = p.mode;
    this.numColorChangesLeft = p.numColorChangesLeft;
    this.numWallsLeft = p.numWallsLeft;
    this.cooldownStartTick = p.cooldownStartTick;
    this.cooldownDurTicks = p.cooldownDurTicks;

    this.facing = p.facing;
    this.sprite.frame = Botonoid.dirToFrame(this.facing);

    //Do not teleport tilePos while moving; tilePos is just a base.
    this.tilePos.set(p.x, p.y)
  } 

  private decrementNumColorChanges(): void {
    this.numColorChangesLeft -= 1;
    if (this.numColorChangesLeft <= 0) {
      //TODO enter cooldown
      console.log("enter cooldown");
    }
  }

  // Optional helper for later collision constraints
  clampToBounds(cols: number, rows: number): void {
    this.tilePos.x = Math.max(0, Math.min(cols - 1, this.tilePos.x));
    this.tilePos.y = Math.max(0, Math.min(rows - 1, this.tilePos.y));
  }

  private getProgressPercentage(nowMs: number): number {
        const estTick = this.getEstimatedTick(nowMs);
        const t = (estTick - this.cooldownStartTick) / this.cooldownDurTicks;
        const tt = Math.max(0, Math.min(1, t)); //clamp to 1
        return 1-tt
    }
  
  draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
    const p = this.getDrawPx(nowMs);
    this.sprite.drawImage(ctx, p.x, p.y);

    //draw a number above the head if not 0
    if (this.numColorChangesLeft > 0) {
      //console.log("drawing a number above head")
      ctx.save();
      ctx.font = '400 21px "Goldman"';
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3;
      ctx.strokeText(String(this.numColorChangesLeft), p.x + this.tileSize/2, p.y+2); //TODO account for offset
      ctx.fillText(String(this.numColorChangesLeft), p.x + this.tileSize/2, p.y+2); // TODO account for offset
      ctx.restore();
    }

    //draw a progress bar above the head if cooldown
    if (this.getMode() === 'cooldown') {
      const percent = this.getProgressPercentage(nowMs);
      const w = this.tileSize * percent;
      const h = 6;
      const x = p.x ;//+ this.tileSize / 2 - w / 2; // keep the second half of this expression to make it centered
      const y = p.y - h;

      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();

    }
    
  }


  private getDrawPx(nowMs: number): Vector2 {
    if (!this.auth.moving) {
        return new Vector2(this.auth.x*this.tileSize, this.auth.y*this.tileSize); //TODO add grid offset
    }

    const estTick = this.getEstimatedTick(nowMs);
    const t = (estTick - this.auth.moveStartTick) / this.auth.moveDurTicks; // t is a number from 0 to 1 on how far into tile walk we are
    const tt = Math.max(0, Math.min(1, t)); //tt is 1 but capped between 0 and 1 (inclusive)
    
    const x = (this.auth.fromX + (this.auth.toX - this.auth.fromX) * tt) * this.tileSize; // TODO add grid offset
    const y = (this.auth.fromY + (this.auth.toY - this.auth.fromY) * tt) * this.tileSize; // TODO add grid offset
    
    return new Vector2(x, y);
        
  }
  
  private static dirToDelta(dir: DirType): { dx: number; dy: number } {
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
      case 'walking':
        this.mode = 'colorChanging';
        this.numColorChangesLeft = MAX_TILES_COLOR_CHANGE;
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