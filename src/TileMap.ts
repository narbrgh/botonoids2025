import {Sprite} from './Sprite';
import { BOMB_EXPLODE_TICKS, NUMBER_OF_COLORS, SERVER_TICK_HZ, X_DRAW_OFFSET, Y_DRAW_OFFSET, GARDEN_GROW_SPEED } from './Constants';
import Vector2 from './Vector2';
import { mulberry32 } from './rng';
import type { SnapshotTileMap, TileChangeListMsg, SillyPadMsg, WallbreakerMsg } from './protocol';

export type ColorChangeResult =
  | 'colorChangeSuccessful'
  | 'colorChangeUnsuccessfulStillDecrementNumber'
  | 'colorChangeUnsuccessfulDoNotDecrementNumber';

 type Tile = {
    index: number;
    changing: boolean;
    tileChangeStartTick: number;
    tileChangeDurTicks: number;
}

type GardenCreationAnimation = {
    //used for "animating" the creation of a garden.
    //This is visual only! (not like the destruction of a garden by a wallbreaker which takes some time and is server-side)
    isActive: boolean;
    gardenChangeTick: number;
    prevIndex: number;
}

type SillyPadState = {
    active: boolean;
    ownerId: number;
    expiresAtTick: number;
    drawIndex: number;
}

type Wallbreaker = {
    x: number;
    y: number;
    startTick: number;
    expiresAtTick: number;
}

type Explosion = {
    x: number;
    y: number;
    startTick: number;
    durTicks: number;
}

export interface TileActions {
  initiateColorChange(tilePos: Vector2): ColorChangeResult;
}

export default class TileMap {
    readonly cols: number;
    readonly rows: number;
    readonly tileSize: number;

    private readonly tileCount: number = 5; 
    private tiles: Tile[][];
    private sillyPads: SillyPadState[][];
    private gardenAnimation: GardenCreationAnimation[][];

    private wallbreakers: Wallbreaker[];
    private explosions: Explosion[];

    private readonly tileSprite: Sprite;
    private readonly sillyPadSprite: Sprite;
    private readonly wallbreakerSprite: Sprite;

    private readonly getEstimatedTick: (nowMs: number) => number;
    private readonly onExplosionStart?: (x: number, y: number) => void;

    constructor(opts: {
        cols: number;
        rows: number;
        tileSize: number;
        tileSprite: Sprite;
        sillyPadSprite: Sprite;
        wallbreakerSprite: Sprite;
        getEstimatedTick: (nowMs: number) => number;
        onExplosionStart?: (x: number, y: number) => void;
    }) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.tileSize = opts.tileSize;
        this.tileSprite = opts.tileSprite;
        this.sillyPadSprite = opts.sillyPadSprite;
        this.wallbreakerSprite = opts.wallbreakerSprite;

        this.getEstimatedTick = opts.getEstimatedTick;
        this.onExplosionStart = opts.onExplosionStart;

        this.tiles = this.generateRandomTiles();
        this.randomizeBoard();

        this.sillyPads = this.initializeSillyPads();
        this.gardenAnimation = this.initializeGardenAnimationTiles();
        this.wallbreakers = [];
        this.explosions = [];

    }

    private randomizeBoard(): void {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.tiles[r][c].index = Math.floor(Math.random() * this.tileCount);
            }
        }
    }

    private initializeSillyPads(): SillyPadState[][] {
        const out: SillyPadState[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: SillyPadState[] = [];
            for (let c = 0; c < this.cols; c++) {
                const t: SillyPadState = {
                    active: false,
                    ownerId: 0,
                    expiresAtTick: 0,
                    drawIndex: 0,
                }
                row.push(t);
            }
            out.push(row)
        }
        return out
    }

    private initializeGardenAnimationTiles(): GardenCreationAnimation[][] {
        const out: GardenCreationAnimation[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: GardenCreationAnimation[] = [];
            for (let c = 0; c < this.cols; c++) {
                const t: GardenCreationAnimation = {
                    isActive: false,
                    gardenChangeTick: 0,
                    prevIndex: 0,
                    
                }
                row.push(t);
            }
            out.push(row)
        }
        return out
    }

    private generateRandomTiles(): Tile[][] {
        const out: Tile[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: Tile[] = [];
            for (let c = 0; c < this.cols; c++) {
                const t: Tile = {
                    index: Math.floor(Math.random() * this.tileCount),
                    changing: false,
                    tileChangeStartTick: 0,
                    tileChangeDurTicks: 0,
                }
                row.push(t);
            }
            out.push(row)
        }
        return out;
    }

    private generateRandomTilesFromSeed(seed: number): Tile[][] {
        
        const rand = mulberry32(seed);
        
        const out: Tile[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: Tile[] = [];
            for (let c = 0; c < this.cols; c++) {
                const t: Tile = {
                    index: Math.floor(rand() * this.tileCount),
                    changing: false,
                    tileChangeStartTick: 0,
                    tileChangeDurTicks: 0,
                }
                row.push(t);
            }
            out.push(row)
        }
        return out;
    }

    reroll(): void {
        this.tiles = this.generateRandomTiles();
        this.sillyPads = this.initializeSillyPads();
        this.wallbreakers = [];
        this.explosions = [];
    }

    setSillyPadFromServerMessage(m: SillyPadMsg, spriteIndex: number) {
        if (m.action === "create") {
            this.createSillyPad(m.x, m.y, m.ownerId, m.expiresAtTick, spriteIndex) 
        } else {
            this.removeSillyPad(m.x, m.y);
        }
    }

    createSillyPad(x: number, y: number, ownerId: number, expiresAtTick: number, spriteIndex: number) {
        if (!this.inBounds(new Vector2(x, y))) {
            return
        }
        this.sillyPads[y][x].active = true
        this.sillyPads[y][x].drawIndex = spriteIndex
        this.sillyPads[y][x].ownerId = ownerId
        this.sillyPads[y][x].expiresAtTick = expiresAtTick
        console.log("created silly pad at %d, %d", x, y);
    }

    removeSillyPad(x: number, y: number) {
        if (!this.inBounds(new Vector2(x, y))) {
            return
        }

        this.sillyPads[y][x].active = false
    }

    sendWallbreakerServerMessage(m: WallbreakerMsg) {
        if (m.action === "create") {
            this.createWallbreaker(m.x, m.y, m.startTick, m.expiresAtTick)
        } else {
            this.removeWallbreaker(m.x, m.y)
        }
    }

    createWallbreaker(x: number, y: number, startTick: number, expiresAtTick: number) {
        this.wallbreakers = this.wallbreakers.filter(wb => !(wb.x === x && wb.y === y));
        this.wallbreakers.push({x, y, startTick, expiresAtTick})
    }

    removeWallbreaker(x: number, y: number) {
        let removed = false;
        this.wallbreakers = this.wallbreakers.filter(wb => {
            const hit = wb.x === x && wb.y === y;
            if (hit) {
                removed = true;
            }
            return !hit;
        });

        if (removed) {
            this.startExplosion(x, y);
        }
    }

    private startExplosion(x: number, y: number, startTickOverride?: number): void {
        const nowTick = startTickOverride ?? this.getEstimatedTick(performance.now());
        this.explosions.push({
            x,
            y,
            startTick: nowTick,
            durTicks: Math.max(4, Math.round(0.6 * SERVER_TICK_HZ)),
        });
        this.onExplosionStart?.(x, y);
    }

    rerollWithSeed(seed: number): void {
        this.tiles = this.generateRandomTilesFromSeed(seed);
    }

    private mixChecksum(h: number, v: number): number {
        const val = v >>> 0;
        const mixed = (h ^ ((val + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2)) >>> 0)) >>> 0;
        return mixed;
    }

    computeChecksum(): number {
        let h = 2166136261 >>> 0;
        h = this.mixChecksum(h, this.cols);
        h = this.mixChecksum(h, this.rows);

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const t = this.tiles[y][x];
                h = this.mixChecksum(h, t.index);
                h = this.mixChecksum(h, t.changing ? 1 : 0);
                h = this.mixChecksum(h, t.tileChangeStartTick);
                h = this.mixChecksum(h, t.tileChangeDurTicks);

                const sp = this.sillyPads[y][x];
                h = this.mixChecksum(h, sp.active ? 1 : 0);
                h = this.mixChecksum(h, sp.ownerId);
                h = this.mixChecksum(h, sp.expiresAtTick);
            }
        }

        h = this.mixChecksum(h, this.wallbreakers.length);
        for (const wb of this.wallbreakers) {
            h = this.mixChecksum(h, wb.x);
            h = this.mixChecksum(h, wb.y);
            h = this.mixChecksum(h, wb.startTick);
            h = this.mixChecksum(h, wb.expiresAtTick);
        }

        return h >>> 0;
    }

    setAuthoritativeInitiateColorChange(tilePos: Vector2, toIndex: number, tileChangeStartTick: number, tileChangeDurTicks: number): void {
        console.log("setAuthoritativeInitiateColorChange");
        if (this.inBounds(tilePos)) {
            this.tiles[tilePos.y][tilePos.x].index = toIndex; // TODO tile change index changed, check locally for a "combo"
            this.tiles[tilePos.y][tilePos.x].changing = true;
            this.tiles[tilePos.y][tilePos.x].tileChangeStartTick = tileChangeStartTick;
            this.tiles[tilePos.y][tilePos.x].tileChangeDurTicks = tileChangeDurTicks;
            console.log("Client side msg: server sent InitiateColorChange at %d, %d", tilePos.x, tilePos.y);
        }
        return;
    }
    

    // TODO This function is deprecated, since the esrver will now pass all of these
    
    initiateColorChange(tilePos: Vector2): ColorChangeResult {

        // if successful, return colorChangeSuccessful
        // if out of bounds, return colorChangeUnsuccessfulDoNotDecrementNumber
        // if it is a "foundation tile", "wall tile" or "flower tile", return colorChangeUnsuccessfulDoNotDecrementNumber
        // if it is a color tile but is still in transition, return colorChangeUnsuccessfulDecrementNumber

        let index = this.getTileIndex(tilePos);
        if (index === null) return 'colorChangeUnsuccessfulDoNotDecrementNumber'; // out of bounds

        if (this.isTileAFoundationWallOrFlower(tilePos)) {
            return 'colorChangeUnsuccessfulDoNotDecrementNumber';
        }
        
        index = index + 1;
        if (index > NUMBER_OF_COLORS-1) { index = 0}
        //TODO here is the code to check for combos
        console.log("color change achieved");
        this.setTileIndex(tilePos, index);

        return 'colorChangeSuccessful';
    }
    


    isTileAFoundationWallOrFlower(tilePos: Vector2): boolean {
        let index = this.getTileIndex(tilePos);
        if (index === null) return false;
        if (index > NUMBER_OF_COLORS - 1) return true;
        return false;
    }

    isTileAFoundation(tilePos: Vector2) : boolean {
        let index = this.getTileIndex(tilePos);
        if (index === null) return false;
        if (index == 5 || index == 8 || index == 11 || index == 14) {
            return true
        }
        return false
    }

    isTileAWall(tilePos: Vector2) : boolean {
        let index = this.getTileIndex(tilePos);
        if (index === null) return false;
        if (index == 6 || index == 9 || index == 12 || index == 15) {
            return true
        }
        return false
    }

    isTileAGarden(tilePos: Vector2) : boolean {
        let index = this.getTileIndex(tilePos);
        if (index === null) return false;
        if (index == 7 || index == 10 || index == 13 || index == 16) {
            return true
        }
        return false
    }

    isIndexAGarden(index: number) : boolean {
        return (index == 7 || index == 10 || index == 13 || index == 16) 
    }

    getTileIndex(tilePos: Vector2): number | null {
        if (!this.inBounds(tilePos)) return null;
        return this.tiles[tilePos.y][tilePos.x].index;
    } 

    setTileIndex(tilePos: Vector2, index: number): void {
        if (this.inBounds(tilePos)) {
            this.tiles[tilePos.y][tilePos.x].index = index;
        }
        return;
    }

    setTileIndexWithDefaultLocation(tilePos: Vector2, index: number, x: number, y: number, nowMs: number): void {
        if (this.isIndexAGarden(index)) {
            const estTick = this.getEstimatedTick(nowMs)
            const distance = Math.abs(x-tilePos.x) + Math.abs(y - tilePos.y)
            this.gardenAnimation[tilePos.y][tilePos.x].isActive = true
            this.gardenAnimation[tilePos.y][tilePos.x].gardenChangeTick = estTick + distance/GARDEN_GROW_SPEED
            this.gardenAnimation[tilePos.y][tilePos.x].prevIndex = this.tiles[tilePos.y][tilePos.x].index
            this.tiles[tilePos.y][tilePos.x].index = index;
        } else if (this.inBounds(tilePos)) {
            this.tiles[tilePos.y][tilePos.x].index = index;
        }
        return;
    }

    inBounds(tilePos: Vector2): boolean {
        if (tilePos.x >= 0 && tilePos.x < this.cols &&
            tilePos.y >= 0 && tilePos.y < this.rows) {
                return true;
        }
    
        return false;
    }

    private getAlpha(nowMs: number, a: Tile): number {
        const estTick = this.getEstimatedTick(nowMs);
        const t = (estTick - a.tileChangeStartTick) / a.tileChangeDurTicks

        const tt = 1-(Math.max(0, Math.min(1, t))); //clamp to 0,1

        return tt * tt ;//* (3 - 2 * tt); // smoothing function: fast->slow->fast
    }

    private getSillyPadAlpha(nowMs: number, a: number): number {
        //for the first (N-1) seconds, the silly pad has an alpha of 1.
        // Then for the final second, it fades smoothly from 1 to 0 over that second
        
        const estTick = this.getEstimatedTick(nowMs)
        const t = (a - estTick) / SERVER_TICK_HZ; // dividing by SERVER_TICK_HZ makes the silly pad fade-out take 1 second
        const tt = Math.max(0, Math.min(1, t)); //clamp to 0, 1
        return tt
    }

    //tint is used for wallbreakers turning red (then eventually flashing at the end)
    private getTintAlpha(startTick: number, expiresAtTick: number, nowMs: number): number {

        //note! last 0.1 seconds will be the last "yellow -> clear" flash. So Expiresattick is corrected to expiresattick-0.1.
        const estTick = this.getEstimatedTick(nowMs)
        const u = Math.max(0, Math.min(1, (estTick - startTick) / ((expiresAtTick-BOMB_EXPLODE_TICKS) - startTick))); // 0..1

        //low pulse rate at spawn -> high pulse rate near explosion
        const f0 = 1.5;
        const f1 = 18.0;

        const phase = 2 * Math.PI * (f0 * u + 0.5 * (f1 - f0) * u * u);
        const pulse = 0.5 + 0.5 * Math.sin(phase);
        const redness = 0.2 + 0.8 * pulse;

        return redness

    }

    private drawExplosion(ctx: CanvasRenderingContext2D, nowMs: number, e: Explosion): void {
        const estTick = this.getEstimatedTick(nowMs);
        const t = (estTick - e.startTick) / e.durTicks;
        const u = Math.max(0, Math.min(1, t));

        if (u <= 0 || u >= 1) {
            return;
        }

        const centerX = e.x * this.tileSize + X_DRAW_OFFSET + this.tileSize / 2;
        const centerY = e.y * this.tileSize + Y_DRAW_OFFSET + this.tileSize / 2;

        // make the circular explosion significantly larger while keeping the same visual style
        const maxRadius = this.tileSize * 2.2;
        const radius = maxRadius * (0.2 + 0.8 * u);
        const fade = 1 - u;

        ctx.save();

        // soft glow
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0.0, `rgba(255,255,200,${0.85 * fade})`);
        gradient.addColorStop(0.4, `rgba(255,150,50,${0.65 * fade})`);
        gradient.addColorStop(1.0, 'rgba(255,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // expanding ring
        ctx.strokeStyle = `rgba(255,230,130,${0.9 * fade})`;
        ctx.lineWidth = Math.max(1, this.tileSize * 0.08 * fade);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
        ctx.stroke();

        // sparks
        ctx.strokeStyle = `rgba(255,235,160,${0.75 * fade})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + u * 2.2;
            const r0 = radius * 0.25;
            const r1 = radius * 0.75;
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(a) * r0, centerY + Math.sin(a) * r0);
            ctx.lineTo(centerX + Math.cos(a) * r1, centerY + Math.sin(a) * r1);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawBackground(ctx: CanvasRenderingContext2D, nowMs: number): void {
        const estTick = this.getEstimatedTick(nowMs)
        // if the underlying resource isn't loaded yet, Sprite.drawImage won't draw it
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const index = this.tiles[r][c].index; 
                const x = c * this.tileSize + X_DRAW_OFFSET;
                const y = r * this.tileSize + Y_DRAW_OFFSET;


                //first draw the tiles

                if (this.gardenAnimation[r][c].isActive) {
                    if (estTick >= this.gardenAnimation[r][c].gardenChangeTick) {
                        this.tileSprite.frame = index;
                    } else {
                        this.tileSprite.frame = this.gardenAnimation[r][c].prevIndex
                    }
                    this.tileSprite.drawImage(ctx,x,y);

                } else { //not a garden-animation tile
                    this.tileSprite.frame = index;
                    this.tileSprite.drawImage(ctx,x,y);

                    if (this.tiles[r][c].changing && !this.isTileAFoundation(new Vector2(c,r))) {
                        let prevTileIndex = this.tiles[r][c].index - 1;
                        if (prevTileIndex < 0) prevTileIndex = NUMBER_OF_COLORS - 1;

                        this.tileSprite.frame = prevTileIndex;

                        const alpha = this.getAlpha(nowMs, this.tiles[r][c]);
                        this.tileSprite.drawImageWithOpacity(ctx, x, y, alpha);
                    }
                }
            } // next c
        } // next r
    }

    drawRowSillyPads(ctx: CanvasRenderingContext2D, nowMs: number, row: number): void {
        if (row < 0 || row >= this.rows) {
            return;
        }

        for (let c = 0; c < this.cols; c++) {
            if (!this.sillyPads[row][c].active) {
                continue;
            }
            this.sillyPadSprite.frame = this.sillyPads[row][c].drawIndex;
            const alpha = this.getSillyPadAlpha(nowMs, this.sillyPads[row][c].expiresAtTick);
            const x = c * this.tileSize + X_DRAW_OFFSET;
            const y = row * this.tileSize + Y_DRAW_OFFSET;
            this.sillyPadSprite.drawImageWithOpacity(ctx, x, y, alpha);
        }
    }

    drawRowBombs(ctx: CanvasRenderingContext2D, nowMs: number, row: number): void {
        if (row < 0 || row >= this.rows) {
            return;
        }

        const estTick = this.getEstimatedTick(nowMs);
        for (const wb of this.wallbreakers) {
            if (wb.y !== row) {
                continue;
            }
            const xD = wb.x * this.tileSize + X_DRAW_OFFSET;
            const yD = wb.y * this.tileSize + Y_DRAW_OFFSET;

            if (wb.expiresAtTick - BOMB_EXPLODE_TICKS > estTick) { // if there is more than 0.1 seconds in the bomb's life
                const tint = this.getTintAlpha(wb.startTick, wb.expiresAtTick, nowMs)
                this.wallbreakerSprite.drawImageWithTint(ctx, xD, yD, "#ff00007c", tint, 1)
            } else if (estTick > wb.expiresAtTick) {
                //Expired; do not draw
            } else { // <= 0.1 seconds left!
                const p = (wb.expiresAtTick - estTick)/BOMB_EXPLODE_TICKS // 0..1
                const pp = 1-Math.max(0, Math.min(1, p));
                this.wallbreakerSprite.drawImageWithTint(ctx, xD, yD, "#ffff00", pp*pp, 1)

            }
        }
    }

    drawRowItems(ctx: CanvasRenderingContext2D, nowMs: number, row: number): void {
        this.drawRowSillyPads(ctx, nowMs, row);
        this.drawRowBombs(ctx, nowMs, row);
    }

    drawExplosions(ctx: CanvasRenderingContext2D, nowMs: number): void {
        for (const e of this.explosions) {
            this.drawExplosion(ctx, nowMs, e);
        }
    }

    draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
        this.drawBackground(ctx, nowMs);
        for (let row = 0; row < this.rows; row++) {
            this.drawRowItems(ctx, nowMs, row);
        }
        this.drawExplosions(ctx, nowMs);
    }

    update(nowMs: number): void {
        //loop through the tiles, and if "changing," update them
        //TODO implement this. If necessary. It may be "good enough" for now to not update the tile changing locally

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.tiles[r][c].changing) {
                    const deltaTicks = this.getEstimatedTick(nowMs) - this.tiles[r][c].tileChangeStartTick
                    if (deltaTicks > this.tiles[r][c].tileChangeDurTicks) {
                        this.tiles[r][c].changing = false;
                    }
                }
            }
        }

        const tick = this.getEstimatedTick(nowMs);
        const activeWallbreakers: Wallbreaker[] = [];
        for (const wb of this.wallbreakers) {
            if (tick >= wb.expiresAtTick) {
                this.startExplosion(wb.x, wb.y, wb.expiresAtTick);
                continue;
            }
            activeWallbreakers.push(wb);
        }
        this.wallbreakers = activeWallbreakers;

        this.explosions = this.explosions.filter(e => (tick - e.startTick) <= e.durTicks);
    }

    setAuthoritativeStateFromTileMapSnapshot(s: SnapshotTileMap) {
        this.tiles = s.tiles
    }

    setAuthoritativeTileChangeList(s: TileChangeListMsg, x: number, y: number, nowMs: number) {
        for (const t of s.tileChangeList) {
            this.setTileIndexWithDefaultLocation(new Vector2(t.x, t.y), t.index, x, y, nowMs)
        }    
    }

}
