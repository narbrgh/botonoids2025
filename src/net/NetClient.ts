import type { Command } from '../commands';
import type { PlayerSnapshotMsg, TileMapSnapshotMsg, ConfigMsg, TileChangeMsg, TileInitiateChangeMsg, TileChangeListMsg, RoleInvalidMsg, SillyPadMsg, SillyPadAction} from '../protocol';

type HelloMsg = { type: 'hello'; playerId: number; msg?: string };

export default class NetClient {
  private ws: WebSocket | null = null;
  private seq = 0;

  playerId: number | null = null;
  config: ConfigMsg | null = null;

  //these "handlers" streamline the code for: first, check if the message is actually the correct message type, then what do you do with the message
      //(previously: I had a bunch of if statements that looked like this:)
      //     if (this.isHelloMsg(raw)) { //isHelloMsg PROMISES to typescript that raw IS of type HelloMsg (see below)
      //         this.playerId = raw.playerId;
      //         return;
      //     }
 
  private handlers = [
    { guard: this.isHelloMsg, handle: (m: HelloMsg) => { this.playerId = m.playerId; } },
    { guard: this.isPlayerSnapshotMsg, handle: (m: PlayerSnapshotMsg) => { this.onPlayerSnapshot?.(m); } },
    { guard: this.isTileMapSnapshotMsg, handle: (m: TileMapSnapshotMsg) => { this.onTileMapSnapshot?.(m);}},
    { guard: this.isConfigMsg, handle: (m: ConfigMsg) => { this.config = m; this.onConfig?.(m); } },
    { guard: this.isTileChangeMsg, handle: (m: TileChangeMsg) => { this.onTileChange?.(m); } },
    { guard: this.isTileChangeListMsg, handle: (m: TileChangeListMsg) => {this.onTileChangeList?.(m); }},
    { guard: this.isTileInitiateChangeMsg, handle: (m: TileInitiateChangeMsg) => { this.onTileInitiateChange?.(m); } },
    { guard: this.isRoleInvalidMsg,  handle: (m: RoleInvalidMsg) => { this.onRoleInvalid?.(m); } },
    { guard: this.isSillyPadMsg, handle: (m: SillyPadMsg) => {this.onSillyPadMsg?.(m); } },
  ];


    connect(url = 'ws://localhost:8080/ws') {
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      console.log('[net] connected');
    });

    this.ws.addEventListener('message', (event) => {
      const raw = JSON.parse(event.data) as unknown;
      
      for (const h of this.handlers) {
        if (h.guard(raw)) {h.handle?.(raw as any); return; }
      }      

      console.log('[net] server msg', raw);
    });

    this.ws.addEventListener('close', () => console.log('[net] disconnected'));
    this.ws.addEventListener('error', (e) => console.log('[net] error', e));
  }

  // this function PROMISES to typescript that the message will be of type HelloMsg after this
  // after this is proven, TypeScript will treat the type as HelloMsg
  // note: it is "trusting" our code and assuming we were correct
  private isHelloMsg(x: unknown): x is HelloMsg { 
    return (
      typeof x === 'object' &&
      x !== null &&
      (x as any).type === 'hello' &&
      typeof (x as any).playerId === 'number'
    );
   }

   private isTileChangeMsg(x: unknown): x is TileChangeMsg {
    return (
      typeof x === 'object' && x !== null &&
      (x as any).type === 'tileChange' &&
      typeof (x as any).x === 'number' &&
      typeof (x as any).y === 'number' &&
      typeof (x as any).index === 'number'
    );

   }

  private isPlayerSnapshotMsg(x: unknown): x is PlayerSnapshotMsg {
    return (
        typeof x === 'object' &&
        x !== null &&
        (x as any).type === 'playerSnapshot' &&
        typeof (x as any).tick === 'number' &&
        Array.isArray((x as any).players)
    );
  }

  private isSillyPadMsg(x: unknown): x is SillyPadMsg {
    return (
      typeof x === 'object' &&
      x != null &&
      (x as any).type === 'sillyPadMsg' &&
      typeof (x as any).action === 'string' &&
      ((x as any).action === 'create' || (x as any).action === 'remove') &&
      typeof (x as any).x === 'number' &&
      typeof (x as any).ownerId === 'number' &&
      typeof (x as any).expiresAtTick === 'number' 
    );
  }



  private isTileMapSnapshotMsg(x: unknown): x is TileMapSnapshotMsg {
    return (
        typeof x === 'object' &&
        x !== null &&
        (x as any).type === 'tileMapSnapshot' &&
        typeof (x as any).tick === 'number' &&
        (x as any).tileMap &&
        typeof (x as any).tileMap === 'object' &&
        typeof (x as any).tileMap.cols === 'number' &&
        typeof (x as any).tileMap.rows === 'number' &&
        Array.isArray((x as any).tileMap.tiles)
    );
  }

  private isTileChangeListMsg(x: unknown): x is TileChangeListMsg {
    return (
        typeof x === 'object' &&
        x !== null &&
        (x as any).type === 'tileChangeList' &&
        Array.isArray((x as any).tileChangeList) && 
        (x as any).tileChangeList.every((t: any) =>
        t &&
        typeof t === 'object' &&
        typeof t.x === 'number' &&
        typeof t.y === 'number' &&
        typeof t.index === 'number'
      )
    );
  }


  private isTileInitiateChangeMsg(x: unknown): x is TileInitiateChangeMsg {
    return (
      typeof x === 'object' && x !== null
      && (x as any).type === 'tileInitiateChange'
      && typeof (x as any).x === 'number'
      && typeof (x as any).y === 'number'
      && typeof (x as any).toIndex === 'number'
      && typeof (x as any).tileChangeStartTick === 'number'
      && typeof (x as any).tileChangeDurTicks === 'number'
    );
  }

  private isConfigMsg(x: unknown): x is ConfigMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'config'
      && typeof (x as any).tickHz === 'number'
      && typeof (x as any).moveTicks === 'number';
  }

  private isRoleInvalidMsg(x: unknown): x is RoleInvalidMsg {
    return typeof x === 'object' && x !== null
     && (x as any).type === 'roleInvalid'
     && typeof (x as any).playerId === 'number';
  }

  //my convention: use s for snapshot, c for config, m for messge
  onPlayerSnapshot?: (s: PlayerSnapshotMsg) => void;
  onTileMapSnapshot?: (s: TileMapSnapshotMsg) => void;
  onConfig?: (c: ConfigMsg) => void;
  onTileChange?: (m: TileChangeMsg) => void;
  onTileChangeList?: (m: TileChangeListMsg) => void;
  onTileInitiateChange?: (m: TileInitiateChangeMsg) => void;
  onRoleInvalid?: (m: RoleInvalidMsg) => void;  
  onSillyPadMsg?: (m: SillyPadMsg) => void;

  sendCommand(cmd: Command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq++;
    this.ws.send(JSON.stringify({ type: 'command', seq: this.seq, cmd }));
  }
}