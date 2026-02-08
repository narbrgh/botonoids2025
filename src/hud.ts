//srcs/hud.ts

import Botonoid from "./Botonoid"
import {Sprite} from "./Sprite"
import { resources } from "./Resources";
import Vector2 from "./Vector2"
import type { Role , ItemType } from "./protocol"

const PLAYER_CARD_WIDTH = 120
const PLAYER_CARD_HEIGHT = 40
const PLAYER_CARD_SPACING = 40

export default class HUD {
    private readonly ctx: CanvasRenderingContext2D;

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
    }

    //class field
    private itemsSprite: Sprite = new Sprite({
        resource: resources.images.items,
        frameSize: new Vector2(32, 32),
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
        
        this.ctx.font =  '400 30px "Goldman"';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = "right";

        this.ctx.lineWidth = 5;
        this.ctx.strokeStyle = "#000000"
        this.ctx.strokeText(`${timeLeft}`, x+ width - 50, y + height / 2);

        this.ctx.fillStyle = '#ffffff';
        if (timeLeft <= 30) {this.ctx.fillStyle = '#ff0000';}

        this.ctx.fillText(`${timeLeft}`, x+ width - 50, y + height / 2);
        
    }

    private drawPlayerCardsFromObserverPerspective(x: number, y: number, width: number, height: number, botsById: Map<number, Botonoid>, n: number) {
        const totalPlayerCardDrawWidth = (n * PLAYER_CARD_WIDTH) + ((n-1) * PLAYER_CARD_SPACING)
        let currentX: number = x+  width / 2 - totalPlayerCardDrawWidth / 2
        let drawY: number = y + height / 2 - PLAYER_CARD_HEIGHT / 2

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
        
        //first some calculations. if there is a box like this:
        // ---------------------
        // |                   |
        // ---------------------
        // and there are three squares that have to fit evenly inside, we need to figure out the
        // "white space" between the boxes, and also apply that to the left and right edge so the  
        // squares don't touch the left and right edges. 
        // So: occupiedWidth = squarewidth * 3
        // unoccupiedWidth = boxWidth - occupiedWidth
        // each individual "white space" is unoccupiedWidth / 4

        const occupiedWidth: number = this.itemsSprite.frameSize.x * 3;
        const unoccupiedWidth: number = width - occupiedWidth;
        const whiteSpace = unoccupiedWidth / 4;

        let color = "rgb(144, 19, 19)"

        switch (bot.getRole()) {
            case "goldBot": {
                color = "rgb(166, 164, 54)"
                break;
            }
            case "blackBot": {
                color = "rgb(0, 0, 0)"
                break;
            }
            case "whiteBot": {
                color = "rgb(255, 255, 255)"
                break;
            }
            case "silverBot": {
                color = "rgb(204, 204, 204)"
                break;
            }   
        }


        this.ctx.strokeStyle = color
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(x, y, width, height)

        const spriteW = this.itemsSprite.frameSize.x * this.itemsSprite.scale;
        const spriteH = this.itemsSprite.frameSize.y * this.itemsSprite.scale;

        let dL: Vector2[] = [ // dL = drawLocation
        new Vector2(x+whiteSpace, y+height/2 - spriteH / 2),
        new Vector2(x+width/2 - spriteW/2, y+height/2-spriteH/2),
        new Vector2(x+width-spriteW-whiteSpace, y+height/2-spriteH/2),
        ];

        //silly pad
        if (bot && bot.getSelectedItem() == "itemSillyPad") {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(dL[0].x, dL[0].y, spriteW, spriteH)
            dL[0].y = dL[0].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 0
        this.itemsSprite.drawImage(this.ctx, dL[0].x, dL[0].y)

        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = "left";
        this.ctx.font =  '400 21px "Goldman"';

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = "#000000"

        this.ctx.fillStyle = '#ffffff';
        
        this.ctx.strokeText(String(bot.getNumSillypadsLeft()), dL[0].x+5, dL[0].y+spriteH/2+4);
        this.ctx.fillText(String(bot.getNumSillypadsLeft()), dL[0].x+5, dL[0].y+spriteH/2+4);

        //wallbreaker
        if (bot && bot.getSelectedItem() == "itemWallbreaker") {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(dL[1].x, dL[1].y, spriteW, spriteH)
            dL[1].y = dL[1].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 1
        this.itemsSprite.drawImage(this.ctx, dL[1].x, dL[1].y )
        this.ctx.strokeText(String(bot.getNumWallbreakersLeft()), dL[1].x + 5, dL[1].y + spriteH / 2 + 4);

        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(String(bot.getNumWallbreakersLeft()), dL[1].x+5, dL[1].y+spriteH/2+4);
        
        //ghost
        if (bot && bot.getSelectedItem() == "itemGhost") {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(dL[2].x, dL[2].y, spriteW, spriteH)
            dL[2].y = dL[2].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 2
        this.itemsSprite.drawImage(this.ctx, dL[2].x, dL[2].y)

        if (bot.getGhostCountLeft() > 0) {
            this.ctx.font =  '400 19px "Goldman"';

            this.ctx.lineWidth = 3;
            this.ctx.strokeText(String(bot.getGhostCountLeft()), dL[2].x + 5, dL[2].y + spriteH / 2 + 4);
            this.ctx.fillText(String(bot.getGhostCountLeft()), dL[2].x+5, dL[2].y+spriteH/2+4);
        }
    }
       
}