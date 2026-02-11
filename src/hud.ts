//srcs/hud.ts

import Botonoid from "./Botonoid"
import {Sprite} from "./Sprite"
import { resources } from "./Resources";
import Vector2 from "./Vector2"
import type { Role , ItemType } from "./protocol"
import { X_DRAW_OFFSET } from "./Constants";

const PLAYER_CARD_WIDTH = 120
const PLAYER_CARD_HEIGHT = 44
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
  
        // for purposes of visibility, will always draw in the order silver, gold, black, white
        //from top to bottom
        const roleRank: Record<string, number> = {
            silverBot: 0,
            goldBot: 1,
            blackBot: 2,
            whiteBot: 3,
        };

        let maxScore = 0

        const sortedBots = [...botsById.values()]
        .filter((bot) => bot.getRole() !== "observer")
        .sort((a, b) => {
            const aRank = roleRank[a.getRole()] ?? Number.MAX_SAFE_INTEGER;
            const bRank = roleRank[b.getRole()] ?? Number.MAX_SAFE_INTEGER;

            if (a.getScore() > maxScore) {maxScore = a.getScore()}
            if (b.getScore() > maxScore) {maxScore = b.getScore()}

            if (aRank !== bRank) return aRank - bRank;
            return a.getId() - b.getId(); // tiebreaker
        });

        let barHeight = 15
        let y1 = y + height/2
        this.ctx.font =  '400 20px "Goldman"';


        if (numActivePlayers == 1) {
            barHeight = 15
            y1 = y + height/2 - barHeight / 2
            this.ctx.font =  '400 20px "Goldman"';

        } else if (numActivePlayers == 2) {
            barHeight = 15
            y1 = y + height/2 - barHeight
            this.ctx.font =  '400 20px "Goldman"';

        } else if (numActivePlayers == 3) {
            barHeight = 12
            y1 = y + height/2 - barHeight - barHeight / 2
            this.ctx.font =  '400 15px "Goldman"';
        } else {
            barHeight = 11
            y1 = y + height/2 - (barHeight*2)
            this.ctx.font =  '400 13px "Goldman"';
        }

        for (const bot of sortedBots) {
            let w = 1.0

            if (maxScore != 0) {w = bot.getScore() / maxScore}

            const drawWidth = 100

            const {color, color2} = this.getColors(bot.getRole())

            this.ctx.fillStyle = color
            this.ctx.strokeStyle = color2
            this.ctx.lineWidth = 2

            this.ctx.fillRect(x+X_DRAW_OFFSET+13, y1+1, w*drawWidth, barHeight-2)
            this.ctx.strokeRect(x+X_DRAW_OFFSET+13, y1+1, w*drawWidth, barHeight-2)

            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = "left";

            this.ctx.lineWidth = 3;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = "#000000"

            this.ctx.strokeText(String(bot.getScore()), x+X_DRAW_OFFSET+13+(w*drawWidth)+15, y1+barHeight/2);
            this.ctx.fillText(String(bot.getScore()), x+X_DRAW_OFFSET+13+(w*drawWidth)+15, y1+barHeight/2);        

            
            y1 += barHeight

        }
        

        //current-player interface
        const me = botsById.get(localPlayerId ?? -1)

        if (!me) {
            this.drawPlayerCardsFromObserverPerspective(x, y, width, height, botsById, numActivePlayers);
        }else if (me.getRole() === "observer") {
            this.drawPlayerCardsFromObserverPerspective(x, y, width, height, botsById, numActivePlayers);
        } else {
            //this.drawPlayerCardsFromPlayerPerspective(me);
            //Currently this is not implemented, but eventually the HUD will look slightly different for players vs observers
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

  

    private getColors(r: Role): {color: string, color2: string} {
        switch (r) {
            case "goldBot": {
                return {color: "rgb(166, 164, 54)", color2: "#915252"}
                break;
            }
            case "blackBot": {
                return {color: "rgb(0, 0, 0)", color2: "#5cadf4"}
                break;
            }
            case "whiteBot": {
                return {color: "rgb(255, 255, 255)", color2: "#ff0000"}
                break;
            }
            case "silverBot": {
                return {color: "rgb(135, 135, 135)", color2: "#b77736"}                
                break;
            } 
            default: {
                return {color: "rgb(144, 19, 19)", color2: "#ffffff"}
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

        
        const {color, color2} = this.getColors(bot.getRole())


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
            
            this.ctx.strokeStyle = color2
            this.ctx.lineWidth = 2
            this.ctx.strokeRect(dL[0].x, dL[0].y, spriteW, spriteH)

            dL[0].y = dL[0].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 0
        this.itemsSprite.drawImage(this.ctx, dL[0].x, dL[0].y)

        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = "left";
        this.ctx.font =  '400 21px "Goldman"';

        this.ctx.lineWidth = 3;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = "#000000"

        this.ctx.strokeText(String(bot.getNumSillypadsLeft()), dL[0].x+5, dL[0].y+spriteH/2+4);
        this.ctx.fillText(String(bot.getNumSillypadsLeft()), dL[0].x+5, dL[0].y+spriteH/2+4);        

        //wallbreaker
        if (bot && bot.getSelectedItem() == "itemWallbreaker") {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(dL[1].x, dL[1].y, spriteW, spriteH)

            this.ctx.strokeStyle = color2
            this.ctx.lineWidth = 2
            this.ctx.strokeRect(dL[1].x, dL[1].y, spriteW, spriteH)

            dL[1].y = dL[1].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 1
        this.itemsSprite.drawImage(this.ctx, dL[1].x, dL[1].y )

        this.ctx.lineWidth = 3;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = "#000000"

        this.ctx.strokeText(String(bot.getNumWallbreakersLeft()), dL[1].x + 5, dL[1].y + spriteH / 2 + 4);
        this.ctx.fillText(String(bot.getNumWallbreakersLeft()), dL[1].x+5, dL[1].y+spriteH/2+4);        

        //ghost
        if (bot && bot.getSelectedItem() == "itemGhost") {      
            this.ctx.fillStyle = color;
            this.ctx.fillRect(dL[2].x, dL[2].y, spriteW, spriteH)

            this.ctx.strokeStyle = color2
            this.ctx.lineWidth = 2
            this.ctx.strokeRect(dL[2].x, dL[2].y, spriteW, spriteH)

            dL[2].y = dL[2].y - 3 // makes currently selected item appear a little bit higher
        }
        this.itemsSprite.frame = 2
        this.itemsSprite.drawImage(this.ctx, dL[2].x, dL[2].y)

        if (bot.getGhostCountLeft() > 0) {
            this.ctx.font =  '400 19px "Goldman"';

            this.ctx.lineWidth = 3;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = "#000000"

            this.ctx.strokeText(String(bot.getGhostCountLeft()), dL[2].x + 5, dL[2].y + spriteH / 2 + 4);
            this.ctx.fillText(String(bot.getGhostCountLeft()), dL[2].x+5, dL[2].y+spriteH/2+4);
        }
    }
       
}
