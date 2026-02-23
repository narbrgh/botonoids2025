// src/protocol.ts
export type DirType = 'up' | 'down' | 'left' | 'right';
export type InputCmd = { type: 'input'; dir: DirType | null };
export type BotonoidMode = 'walking' | 'colorChanging' | 'wallBuilding' | 'ghost' | 'cooldown';

export type Phase = 'phaseLobby' | 'phaseCountdown' | 'phasePlaying' | 'phaseFinished';
export type RoleInvalidMsg = { type: 'roleInvalid'; playerId: number; msg?: string };

export const roles = ["goldBot", "pinkBot", "whiteBot", "blackBot", "randomBot", "observer"] as const;
export type Role = typeof roles[number];

export type ItemType = "itemSillyPad" | "itemWallbreaker" | "itemGhost"

export type CreateOrRemove = "create" | "remove"

export const models = ["alphanoid","herbanoid","barvinoid","randomnoid"] as const;
export type Model = typeof models[number];

export function isRole(v: string): v is Role {
  return (roles as readonly string[]).includes(v);
}

export function isModel(v: string): v is Model {
  return (models as readonly string[]).includes(v);
}

export type SnapshotPlayer = {
  //TODO (later): implement phase (and other gamestate messages) into its own message type, such as RoomStateMsg
  phase: Phase;

  id: number;
  name?: string;
  connected: boolean;
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

  score: number;
  selectedItem: ItemType;
  numWallbreakersLeft: number;
  numSillyPadsLeft: number;

  role: Role;
  model: Model;
  ready?: boolean;
  resultsRole?: Role;
  resultsDismissed?: boolean;
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
  phaseEndsAtTick: number;
  mapChecksum: number;
  players: SnapshotPlayer[];
};

export type PlayerDelta = {
  id: number;
  connected?: boolean;
  x?: number;
  y?: number;
  facing?: DirType;
  intentDir?: DirType;
  role?: Role;
  model?: Model;
  moving?: boolean;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  moveStartTick?: number;
  moveDurTicks?: number;
  mode?: BotonoidMode;
  numColorChangesLeft?: number;
  numWallsLeft?: number;
  cooldownStartTick?: number;
  cooldownDurTicks?: number;
  score?: number;
  selectedItem?: ItemType;
  numWallbreakersLeft?: number;
  numSillyPadsLeft?: number;
};

export type PlayerDeltaMsg = {
  type: "playerDelta";
  tick: number;
  phase: Phase;
  phaseEndsAtTick: number;
  mapChecksum: number;
  deltas: PlayerDelta[];
};

export type PlayerMeta = {
  id: number;
  name?: string;
  role: Role;
  model: Model;
};

export type PlayerMetaSnapshotMsg = {
  type: 'playerMetaSnapshot';
  players: PlayerMeta[];
};

export type PlayerStatus = {
  id: number;
  ready: boolean;
  resultsRole: Role;
  resultsDismissed: boolean;
};

export type PlayerStatusSnapshotMsg = {
  type: 'playerStatusSnapshot';
  players: PlayerStatus[];
};

export type TileMapSnapshotMsg = {
  type: 'tileMapSnapshot'; // formerly just said 'snapshot'
  tick: number;
  phase: Phase;
  tileMap: SnapshotTileMap;
};

export type SillyPadMsg = {
  type: 'sillyPadMsg';
  action: CreateOrRemove;
  x: number;
  y: number;
  ownerId: number;
  expiresAtTick: number;
}

export type WallbreakerMsg = {
  type: 'wallbreakerMsg';
  action: CreateOrRemove;
  x: number;
  y: number;
  startTick: number;
  expiresAtTick: number;
}

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

export type RoomStatus = 'open' | 'starting' | 'in_game' | 'finished';

export type RoomSummary = {
  id: string;
  name: string;
  hostId: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  createdAtUnix: number;
};

export type RoomsListOkMsg = {
  type: 'rooms:list:ok';
  rooms: RoomSummary[];
  yourRoomId?: string;
};

export type RoomCreateOkMsg = {
  type: 'room:create:ok';
  roomId: string;
};

export type RoomJoinOkMsg = {
  type: 'room:join:ok';
  roomId: string;
};

export type RoomLeaveOkMsg = {
  type: 'room:leave:ok';
};

export type RoomActionErrorMsg = {
  type: 'room:error';
  code?: string;
  msg: string;
};

export type ChatMsg = {
  type: 'chat';
  playerId: number;
  name: string;
  text: string;
};
