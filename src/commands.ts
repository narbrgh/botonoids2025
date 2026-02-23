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
    | { type: 'ready'; ready: boolean; role: Role ; model: Model}
    | { type: 'roomsList' }
    | { type: 'roomCreate'; name: string; maxPlayers: number }
    | { type: 'roomJoin'; roomId: string }
    | { type: 'roomLeave' }
    | { type: 'roleSelect'; role: Role }
    | { type: 'name'; name: string }
    | { type: 'chat'; text: string }
    | { type: 'cancelCountdown' }
    | { type: 'resultsOk' }
    | { type: 'resyncRequest' }
