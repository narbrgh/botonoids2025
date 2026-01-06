//Core timing (milliseconds)
export const MOVE_DURATION_MS = 500; // tile to tile movement. if you change here, change in main.go.
export const COLOR_CHANGE_COOLDOWN_MS = 1000; //after you change 5 tiles, how long before you can enter color change mode again

//Color-changing rules
export const MAX_TILES_COLOR_CHANGE = 5; // how many tiles you can change color of at once
export const TILE_COLOR_CHANGE_MS = 1000; // how long an individual tile takes to change colors before it will accept changing again
export const NUMBER_OF_COLORS = 5; // red, orange, green, blue, purplse

export const TILE_SIZE = 32;
export const FRAME_SIZE = 32;

export const NUM_COLS = 30; //TODO make code use this
export const NUM_ROWS = 17; //TODO make code use this

export const SERVER_TICK_HZ = 20; // TODO make this be "imported" from the authoritative server
export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;
