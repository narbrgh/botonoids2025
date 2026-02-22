import type { Command } from '../commands';
import type { PlayerSnapshotMsg, TileMapSnapshotMsg, ConfigMsg, TileChangeMsg, TileInitiateChangeMsg, TileChangeListMsg, RoleInvalidMsg, SillyPadMsg, WallbreakerMsg, RoomsListOkMsg, RoomCreateOkMsg, RoomJoinOkMsg, RoomLeaveOkMsg, RoomActionErrorMsg, ChatMsg } from '../protocol';

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
    { guard: this.isHelloMsg, handle: (m: HelloMsg) => { this.playerId = m.playerId; this.onHello?.(m); } },
    { guard: this.isPlayerSnapshotMsg, handle: (m: PlayerSnapshotMsg) => { this.onPlayerSnapshot?.(m); } },
    { guard: this.isTileMapSnapshotMsg, handle: (m: TileMapSnapshotMsg) => { this.onTileMapSnapshot?.(m);}},
    { guard: this.isConfigMsg, handle: (m: ConfigMsg) => { this.config = m; this.onConfig?.(m); } },
    { guard: this.isTileChangeMsg, handle: (m: TileChangeMsg) => { this.onTileChange?.(m); } },
    { guard: this.isTileChangeListMsg, handle: (m: TileChangeListMsg) => {this.onTileChangeList?.(m); }},
    { guard: this.isTileInitiateChangeMsg, handle: (m: TileInitiateChangeMsg) => { this.onTileInitiateChange?.(m); } },
    { guard: this.isRoleInvalidMsg,  handle: (m: RoleInvalidMsg) => { this.onRoleInvalid?.(m); } },
    { guard: this.isSillyPadMsg, handle: (m: SillyPadMsg) => {this.onSillyPadMsg?.(m); } },
    { guard: this.isWallbreakerMsg, handle: (m: WallbreakerMsg) => {this.onWallbreakerMsg?.(m); } },
    { guard: this.isRoomsListOkMsg, handle: (m: RoomsListOkMsg) => { this.onRoomsList?.(m); } },
    { guard: this.isRoomCreateOkMsg, handle: (m: RoomCreateOkMsg) => { this.onRoomCreateOk?.(m); } },
    { guard: this.isRoomJoinOkMsg, handle: (m: RoomJoinOkMsg) => { this.onRoomJoinOk?.(m); } },
    { guard: this.isRoomLeaveOkMsg, handle: (m: RoomLeaveOkMsg) => { this.onRoomLeaveOk?.(m); } },
    { guard: this.isRoomActionErrorMsg, handle: (m: RoomActionErrorMsg) => { this.onRoomError?.(m); } },
    { guard: this.isChatMsg, handle: (m: ChatMsg) => { this.onChat?.(m); } },

  ];

  private defaultWsUrl(): string {
    // Optional explicit override (for example: wss://api.botonoids.com/ws).
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) return envUrl;

    const { protocol, hostname, host } = window.location;

    // Local Vite dev server runs on :5173 while Go server typically runs on :8080.
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8080/ws';
    }

    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}/ws`;
  }

  connect(url?: string) {
    this.ws = new WebSocket(url ?? this.defaultWsUrl());

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

  private isWallbreakerMsg(x: unknown): x is WallbreakerMsg {
    return (
      typeof x === 'object' &&
      x != null &&
      (x as any).type === 'wallbreakerMsg' &&
      typeof (x as any).action === 'string' &&
      ((x as any).action === 'create' || (x as any).action === 'remove') &&
      typeof (x as any).x === 'number' &&
      typeof (x as any).startTick === 'number' &&
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

  private isRoomsListOkMsg(x: unknown): x is RoomsListOkMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'rooms:list:ok'
      && Array.isArray((x as any).rooms);
  }

  private isRoomCreateOkMsg(x: unknown): x is RoomCreateOkMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'room:create:ok'
      && typeof (x as any).roomId === 'string';
  }

  private isRoomJoinOkMsg(x: unknown): x is RoomJoinOkMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'room:join:ok'
      && typeof (x as any).roomId === 'string';
  }

  private isRoomLeaveOkMsg(x: unknown): x is RoomLeaveOkMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'room:leave:ok';
  }

  private isRoomActionErrorMsg(x: unknown): x is RoomActionErrorMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'room:error'
      && typeof (x as any).msg === 'string';
  }

  private isChatMsg(x: unknown): x is ChatMsg {
    return typeof x === 'object' && x !== null
      && (x as any).type === 'chat'
      && typeof (x as any).name === 'string'
      && typeof (x as any).text === 'string';
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
  onWallbreakerMsg?: (m: WallbreakerMsg) => void;
  onHello?: (m: HelloMsg) => void;
  onRoomsList?: (m: RoomsListOkMsg) => void;
  onRoomCreateOk?: (m: RoomCreateOkMsg) => void;
  onRoomJoinOk?: (m: RoomJoinOkMsg) => void;
  onRoomLeaveOk?: (m: RoomLeaveOkMsg) => void;
  onRoomError?: (m: RoomActionErrorMsg) => void;
  onChat?: (m: ChatMsg) => void;

  sendCommand(cmd: Command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq++;
    this.ws.send(JSON.stringify({ type: 'command', seq: this.seq, cmd }));
  }
}
