import {Sprite} from './Sprite';

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

    reroll(): void {
        this.tiles = this.generateRandomTiles();
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