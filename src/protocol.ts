// src/protocol.ts
export type DirType = 'up' | 'down' | 'left' | 'right';
export type InputCmd = { type: 'input'; dir: DirType | null };

export type SnapshotPlayer = {
  id: number;
  x: number;
  y: number;
  facing: DirType;

  moving: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveStartTick: number;
  moveDurTicks: number;
};

export type SnapshotMsg = {
  type: 'snapshot';
  tick: number;
  phase: 'lobby' | 'countdown' | 'playing' | 'finished';
  players: SnapshotPlayer[];
};

