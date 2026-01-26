import type { DirType } from "./protocol";

export type Command = 
    | { type: 'input'; dir: DirType | null }
    | { type: 'move'; dir: 'up'|'down'|'left'|'right' }
    | { type: 'facing'; dir: 'up'|'down'|'left'|'right' }
    | { type: 'actionDown' }
    | { type: 'actionUp' }
    | { type: 'changeItem' }
    | { type: 'useItem'}