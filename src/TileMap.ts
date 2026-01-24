import {Sprite} from './Sprite';
import { NUMBER_OF_COLORS} from './Constants';
import Vector2 from './Vector2';
import { mulberry32 } from './rng';

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

export interface TileActions {
  initiateColorChange(tilePos: Vector2): ColorChangeResult;
}

export default class TileMap {
    readonly cols: number;
    readonly rows: number;
    readonly tileSize: number;

    private readonly tileCount: number = 5; 
    private tiles: Tile[][];
    private readonly tileSprite: Sprite;

    private readonly getEstimatedTick: (nowMs: number) => number;

    constructor(opts: {
        cols: number;
        rows: number;
        tileSize: number;
        tileSprite: Sprite;
        getEstimatedTick: (nowMs: number) => number;
    }) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.tileSize = opts.tileSize;
        this.tileSprite = opts.tileSprite;

        this.getEstimatedTick = opts.getEstimatedTick;

        this.tiles = this.generateRandomTiles();
        this.randomizeBoard();

    }

    private randomizeBoard(): void {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.tiles[r][c].index = Math.floor(Math.random() * this.tileCount);
            }
        }
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
    }

    rerollWithSeed(seed: number): void {
        this.tiles = this.generateRandomTilesFromSeed(seed);
    }

    setAuthoritativeInitiateColorChange(tilePos: Vector2, toIndex: number, tileChangeStartTick: number, tileChangeDurTicks: number): void {
        console.log("setAuthoritativeInidiateColorChange");
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
        const tt = Math.max(0, Math.min(1, t)); //clamp to 1
        return 1-tt
    }

    draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
        // if the underlying resource isn't loaded yet, Sprite.drawImage won't draw it
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const index = this.tiles[r][c].index; 
                const x = c * this.tileSize;
                const y = r * this.tileSize;

                this.tileSprite.frame = index;
                this.tileSprite.drawImage(ctx,x,y);

                if (this.tiles[r][c].changing) {
                    let prevTileIndex = this.tiles[r][c].index - 1;
                    if (prevTileIndex < 0) prevTileIndex = NUMBER_OF_COLORS - 1;

                    this.tileSprite.frame = prevTileIndex;

                    const alpha = this.getAlpha(nowMs, this.tiles[r][c]);
                    this.tileSprite.drawImageWithOpacity(ctx, x, y, alpha);
                }

            }
        }
    }

    CheckColorChangeResult(x: number, y: number, player: number): ColorChangeResult {
        return 'colorChangeSuccessful'
    }

    update(): void {

    }

}