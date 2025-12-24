import type { Command } from "./commands";
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Controller {
    /** Move intent right now (stack / held-based). Used when the player is idle */
    getMoveIntent(): Dir | null;

    /** Edge-triggers non-move commands since last call (action/changeItem/useItem) */
    consumeCommands(): Command[];
}