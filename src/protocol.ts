import type TileMap from "./TileMap";

// src/protocol.ts
export type DirType = 'up' | 'down' | 'left' | 'right';
export type InputCmd = { type: 'input'; dir: DirType | null };
export type BotonoidMode = 'walking' | 'colorChanging' | 'wallBuilding' | 'ghost' | 'cooldown';

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

  mode: BotonoidMode;
  numColorChangesLeft: number;
  numWallsLeft: number;
  cooldownStartTick: number;
  cooldownDurTicks: number;
};

export type SnapshotTile = {
  index: number;
  changing: boolean;
  tileChangeStartTick: number;
  tileChangeDurTicks: number;
}

export type SnapshotTileMap = {
  cols: number;
  rows: number;
  tiles: SnapshotTile[][];
}

export type PlayerSnapshotMsg = {
  type: 'snapshot';
  tick: number;
  phase: 'lobby' | 'countdown' | 'playing' | 'finished';
  players: SnapshotPlayer[];
};

export type TileMapSnapshotMsg = {
  type: 'snapshot';
  tick: number;
  phase: 'lobby' | 'countdown' | 'playing' | 'finished';
  tileMap: SnapshotTileMap;
};

export type TileChangeMsg = {
 type: "tileChange";
 x: number;
 y: number;
 index: number;
}

export type TileInitiateChangeMsg = {
  type: "tileInitiateChange";
  x: number;
  y: number;
  toIndex: number;
  tileChangeStartTick: number;
  tileChangeDurTicks: number;
}

export type ConfigMsg = {
  type: 'config';
  tickHz: number;
  moveTicks: number;
  moveDurMs: number;
  colorCooldownMs: number;
  maxTilesColorChange: number;
  tileSize: number;
  seed: number;
	cols: number;
  rows: number;
  configVersion: number;
};