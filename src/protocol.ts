// src/protocol.ts
export type DirType = 'up' | 'down' | 'left' | 'right';

export type SnapshotPlayer = {
  id: number;
  x: number;
  y: number;
  facing: DirType;
};

export type SnapshotMsg = {
  type: 'snapshot';
  tick: number;
  players: SnapshotPlayer[];
};