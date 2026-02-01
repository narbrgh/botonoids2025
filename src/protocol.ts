import type TileMap from "./TileMap";

// src/protocol.ts
export type DirType = 'up' | 'down' | 'left' | 'right';
export type InputCmd = { type: 'input'; dir: DirType | null };
export type BotonoidMode = 'walking' | 'colorChanging' | 'wallBuilding' | 'ghost' | 'cooldown';
export type Role = 'goldBot' | 'silverBot' | 'whiteBot' | 'blackBot' | 'randomBot' | 'observer';
export type Phase = 'phaseLobby' | 'phaseCountdown' | 'phasePlaying' | 'phaseFinished';
export type RoleInvalidMsg = { type: 'roleInvalid'; playerId: number; msg?: string };

export type SnapshotPlayer = {
  //TODO (later): implement phase (and other gamestate messages) into its own message type, such as RoomStateMsg
  phase: Phase;

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

export type TileDelta = { // tile delta is used in changing numerous tiles at once (such as a combo or a garden)
  x: number;
  y: number;
  index: number;
}

export type SnapshotTileMap = {
  cols: number;
  rows: number;
  tiles: SnapshotTile[][];
}

export type PlayerSnapshotMsg = {
  type: 'playerSnapshot'; // formerly just said 'snapshot'
  tick: number;
  phase: Phase;
  players: SnapshotPlayer[];
};

export type TileMapSnapshotMsg = {
  type: 'tileMapSnapshot'; // formerly just said 'snapshot'
  tick: number;
  phase: Phase;
  tileMap: SnapshotTileMap;
};

//this changes a single tile
export type TileChangeMsg = {
 type: "tileChange";
 x: number;
 y: number;
 index: number;
}

//this broadcasts a change of a list of tiles (ex: combo or garden)
export type TileChangeListMsg = {
  type: "tileChangeList";
  tileChangeList: TileDelta[];
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