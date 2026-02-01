import type { DirType, Role, Model } from "./protocol";

// commands are sent from the client to the server. this is the only message type from client -> server at the moment


export type Command = 
    | { type: 'input'; dir: DirType | null }
    | { type: 'move'; dir: 'up'|'down'|'left'|'right' }
    | { type: 'facing'; dir: 'up'|'down'|'left'|'right' }
    | { type: 'actionDown' }
    | { type: 'actionUp' }
    | { type: 'changeItem' }
    | { type: 'useItem'}
    | { type: 'ready'; role: Role ; model: Model}