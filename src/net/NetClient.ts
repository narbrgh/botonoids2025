import type { Command } from '../commands';
import type { SnapshotMsg } from '../protocol';

type HelloMsg = { type: 'hello'; playerId: number; msg?: string };

export default class NetClient {
  private ws: WebSocket | null = null;
  private seq = 0;

  playerId: number | null = null;

  connect(url = 'ws://localhost:8080/ws') {
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      console.log('[net] connected');
    });

    this.ws.addEventListener('message', (event) => {
      const raw = JSON.parse(event.data) as unknown;

      //Typescript basic: since (event) => is an ARROW function, this. refers to
      //NetClient scope

      if (this.isHelloMsg(raw)) { //isHelloMsg PROMISES to typescript that raw IS of type HelloMsg (see below)
        this.playerId = raw.playerId;
        console.log('[net] assigned playerId', this.playerId);
        return;
      }

      if (this.isSnapshotMsg(raw)) {
        this.onSnapshot?.(raw);
        return;
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

  private isSnapshotMsg(x: unknown): x is SnapshotMsg {
    return (
        typeof x === 'object' &&
        x !== null &&
        (x as any).type === 'snapshot' &&
        typeof (x as any).tick === 'number' &&
        Array.isArray((x as any).players)
    );
  }

  onSnapshot?: (s: SnapshotMsg) => void;


  sendCommand(cmd: Command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq++;
    this.ws.send(JSON.stringify({ type: 'command', seq: this.seq, cmd }));
  }
}