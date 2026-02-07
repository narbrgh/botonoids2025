//srcs/hud.ts

import Botonoid from "./Botonoid"
import {Sprite} from "./Sprite"
import { resources } from "./Resources";
import Vector2 from "./Vector2"
import type { Role , ItemType } from "./protocol"

const PLAYER_CARD_WIDTH = 80
const PLAYER_CARD_HEIGHT = 34
const PLAYER_CARD_SPACING = 40

export default class HUD {
    private readonly ctx: CanvasRenderingContext2D;

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
    }

    //class field
    private itemsSprite: Sprite = new Sprite({
        resource: resources.images.items,
        frameSize: new Vector2(24, 24),
        hFrames: 1,
        vFrames: 3,
        frame: 0,
        scale: 1,
    });

    draw(opts: {
        x: number;
        y: number;
        width: number;
        height: number;

        //data to draw
        timeLeft: number;
        botsById: Map<number, Botonoid>;
        localPlayerId?: number | null;
        numActivePlayers: number;

    }) {
        //draw background, text, etc
        const { x, y, width, height, timeLeft, botsById, localPlayerId, numActivePlayers } = opts;

        //In order, from left to right, it will draw score bars, then player cards, then time left

        //Score bars:


        //current-player interface
        const me = botsById.get(localPlayerId ?? -1)

        if (!me) {
            this.drawPlayerCardsFromObserverPerspective(x, y, width, height, botsById, numActivePlayers);
        }else if (me.getRole() === "observer") {
            this.drawPlayerCardsFromObserverPerspective(x, y, width, height, botsById, numActivePlayers);
        } else {
            //this.drawPlayerCardsFromPlayerPerspective(me);
            this.drawPlayerCardsFromObserverPerspective(x, y, width, height, botsById, numActivePlayers);
        }

        // Time left
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px monospace';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${timeLeft}`, x+ width / 2, y + height / 2);
        
    }

    private drawPlayerCardsFromObserverPerspective(x: number, y: number, width: number, height: number, botsById: Map<number, Botonoid>, n: number) {
        const totalPlayerCardDrawWidth = (n * PLAYER_CARD_WIDTH) + ((n-1) * PLAYER_CARD_SPACING)
        let currentX: number = x+  width / 2 - totalPlayerCardDrawWidth / 2
        let drawY: number = y + height / 2 - PLAYER_CARD_HEIGHT / 2

        this.ctx.fillStyle = "rgba(255,255,255,0.4)"
        this.ctx.fillRect(currentX, drawY, PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT)

        const bots = [...botsById.values()].sort((a, b) => a.getId() - b.getId());
        for (const bot of bots) { 
            if (bot && bot.getRole() != "observer") {
                this.drawPlayerInfoCardSmall(currentX, drawY, PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT, bot)
                currentX += PLAYER_CARD_SPACING + PLAYER_CARD_WIDTH
            }
        }
    }   

    // Small player info card is what is drawn for observer mode for all players, 
    // and is drawn for all the "other" players in player mode
    private drawPlayerInfoCardSmall(x: number, y: number, width: number, height: number, bot: Botonoid) {
        
        this.ctx.fillStyle = "rgba(255,255,255,0.4)"
        this.ctx.fillRect(x, y, width, height)

        const spriteW = this.itemsSprite.frameSize.x * this.itemsSprite.scale;
        const spriteH = this.itemsSprite.frameSize.y * this.itemsSprite.scale;

        //silly pad
        if (bot && bot.getSelectedItem() == "itemSillyPad") {
            this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
            this.ctx.fillRect(x, y+height/2 - spriteH / 2, spriteW, spriteH)
        }
        this.itemsSprite.frame = 0
        this.itemsSprite.drawImage(this.ctx, x, y + height/2)

        //wallbreaker
        if (bot && bot.getSelectedItem() == "itemSillyPad") {
            this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
            this.ctx.fillRect(x+width/2-spriteW/2, y+height/2 - spriteH / 2, spriteW, spriteH)
        }
        this.itemsSprite.frame = 1
        this.itemsSprite.drawImage(this.ctx, x + width/2, y + height/2)
        
        //ghost
        if (bot && bot.getSelectedItem() == "itemSillyPad") {
            this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
            this.ctx.fillRect(x+width-spriteW, y+height/2 - spriteH / 2, spriteW, spriteH)
        }
        this.itemsSprite.frame = 2
        this.itemsSprite.drawImage(this.ctx, x + width - spriteW, y + height/2)
    }
       
}