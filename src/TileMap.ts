import {Sprite} from './Sprite';
import { BOMB_EXPLODE_TICKS, NUMBER_OF_COLORS, SERVER_TICK_HZ, X_DRAW_OFFSET, Y_DRAW_OFFSET} from './Constants';
import Vector2 from './Vector2';
import { mulberry32 } from './rng';
import type { SnapshotTileMap, SnapshotTile, TileChangeListMsg, SillyPadMsg, WallbreakerMsg } from './protocol';

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

    private wallbreakers: Wallbreaker[];

    private readonly tileSprite: Sprite;
    private readonly sillyPadSprite: Sprite;
    private readonly wallbreakerSprite: Sprite;

    private readonly getEstimatedTick: (nowMs: number) => number;

    constructor(opts: {
        cols: number;
        rows: number;
        tileSize: number;
        tileSprite: Sprite;
        sillyPadSprite: Sprite;
        wallbreakerSprite: Sprite;
        getEstimatedTick: (nowMs: number) => number;
    }) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.tileSize = opts.tileSize;
        this.tileSprite = opts.tileSprite;
        this.sillyPadSprite = opts.sillyPadSprite;
        this.wallbreakerSprite = opts.wallbreakerSprite;

        this.getEstimatedTick = opts.getEstimatedTick;

        this.tiles = this.generateRandomTiles();
        this.randomizeBoard();

        this.sillyPads = this.initializeSillyPads();
        this.wallbreakers = [];

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
        this.wallbreakers.push({x, y, startTick, expiresAtTick})
    }

    removeWallbreaker(x: number, y: number) {
        //TODO make explosion sound / effect
    }

    rerollWithSeed(seed: number): void {
        this.tiles = this.generateRandomTilesFromSeed(seed);
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

    draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
        // if the underlying resource isn't loaded yet, Sprite.drawImage won't draw it
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const index = this.tiles[r][c].index; 
                const x = c * this.tileSize + X_DRAW_OFFSET;
                const y = r * this.tileSize + Y_DRAW_OFFSET;

                //first draw the tiles

                this.tileSprite.frame = index;
                this.tileSprite.drawImage(ctx,x,y);

                if (this.tiles[r][c].changing) {
                    let prevTileIndex = this.tiles[r][c].index - 1;
                    if (prevTileIndex < 0) prevTileIndex = NUMBER_OF_COLORS - 1;

                    this.tileSprite.frame = prevTileIndex;

                    const alpha = this.getAlpha(nowMs, this.tiles[r][c]);
                    this.tileSprite.drawImageWithOpacity(ctx, x, y, alpha);
                }

                //now draw silly pad
                if (this.sillyPads[r][c].active) {
                    this.sillyPadSprite.frame = this.sillyPads[r][c].drawIndex
                    
                    const alpha = this.getSillyPadAlpha(nowMs, this.sillyPads[r][c].expiresAtTick); 
                    this.sillyPadSprite.drawImageWithOpacity(ctx,x,y, alpha)
                }

            } // next c
        } // next r

        //now draw wallbreakers
        for (const wb of this.wallbreakers) {
            const xD = wb.x * this.tileSize + X_DRAW_OFFSET;
            const yD = wb.y * this.tileSize + Y_DRAW_OFFSET;

            if (wb.expiresAtTick - BOMB_EXPLODE_TICKS > this.getEstimatedTick(nowMs)) { // if there is more than 0.1 seconds in the bomb's life
                const tint = this.getTintAlpha(wb.startTick, wb.expiresAtTick, nowMs)
                this.wallbreakerSprite.drawImageWithTint(ctx, xD, yD, "#ff00007c", tint, 1)
            } else if (this.getEstimatedTick(nowMs) > wb.expiresAtTick) {
                //Expired; do not draw
            } else { // <= 0.1 seconds left!
                const p = (wb.expiresAtTick - this.getEstimatedTick(nowMs))/BOMB_EXPLODE_TICKS // 0..1
                const pp = 1-Math.max(0, Math.min(1, p));
                this.wallbreakerSprite.drawImageWithTint(ctx, xD, yD, "#ffff00", pp*pp, 1)

            }

        }
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
    }

    setAuthoritativeStateFromTileMapSnapshot(s: SnapshotTileMap) {
        this.tiles = s.tiles
    }

    setAuthoritativeTileChangeList(s: TileChangeListMsg) {
        for (const t of s.tileChangeList) {
            this.setTileIndex(new Vector2(t.x, t.y), t.index)
        }    
    }

}