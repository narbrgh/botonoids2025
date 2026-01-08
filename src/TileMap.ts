import {Sprite} from './Sprite';
import { NUMBER_OF_COLORS} from './Constants';
import Vector2 from './Vector2';
import { mulberry32 } from './rng';

export type ColorChangeResult =
  | 'colorChangeSuccessful'
  | 'colorChangeUnsuccessfulStillDecrementNumber'
  | 'colorChangeUnsuccessfulDoNotDecrementNumber';

export interface TileActions {
  initiateColorChange(tilePos: Vector2): ColorChangeResult;
}

export default class TileMap {
    readonly cols: number;
    readonly rows: number;
    readonly tileSize: number;

    private readonly tileCount: number = 5; 
    private tiles: number[][];
    private readonly tileSprite: Sprite;

    constructor(opts: {
        cols: number;
        rows: number;
        tileSize: number;
        tileSprite: Sprite;
    }) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.tileSize = opts.tileSize;
        this.tileSprite = opts.tileSprite;

        this.tiles = this.generateRandomTiles();
        this.randomizeBoard();

    }

    private randomizeBoard(): void {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.tiles[r][c] = Math.floor(Math.random() * this.tileCount);
            }
        }
    }

    private generateRandomTiles(): number[][] {
        const out: number[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: number[] = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(Math.floor(Math.random() * this.tileCount));
            }
            out.push(row)
        }
        return out;
    }

    private generateRandomTilesFromSeed(seed: number): number[][] {
        
        const rand = mulberry32(seed);
        
        const out: number[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: number[] = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(Math.floor(rand() * this.tileCount));
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
        return this.tiles[tilePos.y][tilePos.x];
    } 

    setTileIndex(tilePos: Vector2, index: number): void {
        if (this.inBounds(tilePos)) {
            this.tiles[tilePos.y][tilePos.x] = index;
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

    draw(ctx: CanvasRenderingContext2D): void {
        // if the underlying resource isn't loaded yet, Sprite.drawImage won't draw it
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const index = this.tiles[r][c]; 
                const x = c * this.tileSize;
                const y = r * this.tileSize;

                this.tileSprite.frame = index;
                this.tileSprite.drawImage(ctx,x,y);

            }
        }
    }

}