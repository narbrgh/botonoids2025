import type { Command } from '../commands';
import type { PlayerSnapshotMsg, ConfigMsg, TileChangeMsg, TileInitiateChangeMsg} from '../protocol';

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
    { guard: this.isConfigMsg, handle: (m: ConfigMsg) => { this.config = m; this.onConfig?.(m); } },
    { guard: this.isTileChangeMsg, handle: (m: TileChangeMsg) => { this.onTileChange?.(m); } },
    { guard: this.isTileInitiateChangeMsg, handle: (m: TileInitiateChangeMsg) => { this.onTileInitiateChange?.(m); } },
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
        (x as any).type === 'snapshot' &&
        typeof (x as any).tick === 'number' &&
        Array.isArray((x as any).players)
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

  //my convention: use s for snapshot, c for config, m for messge
  onPlayerSnapshot?: (s: PlayerSnapshotMsg) => void;
  onConfig?: (c: ConfigMsg) => void;
  onTileChange?: (m: TileChangeMsg) => void;
  onTileInitiateChange?: (m: TileInitiateChangeMsg) => void;

  

  sendCommand(cmd: Command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq++;
    this.ws.send(JSON.stringify({ type: 'command', seq: this.seq, cmd }));
  }
}