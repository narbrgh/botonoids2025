export type Command = 
    | { type: 'move'; dir: 'up'|'down'|'left'|'right' }
    | {type: 'facing'; dir: 'up'|'down'|'left'|'right' }
    | { type: 'action' }
    | { type: 'changeItem' }
    | { type: 'useItem'}