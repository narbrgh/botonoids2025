//srcs/hud.ts

import Botonoid from "./Botonoid"

export default class HUD {
    private readonly ctx: CanvasRenderingContext2D;

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
    }

    draw(opts: {
        x: number;
        y: number;
        width: number;
        height: number;

        //data to draw
        timeLeft: number;
        botsById: Map<number, Botonoid>;
        localPlayerId?: number | null;

    }) {
        //draw background, text, etc
        const { x, y, width, height, timeLeft } = opts;

        // label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px monospace';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`Time: ${timeLeft}s`, x+ width / 2, y + height / 2);

        
    }
}