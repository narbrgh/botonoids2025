//Core timing (milliseconds)
export const MOVE_DURATION_MS = 500; // tile to tile movement. if you change here, change in main.go.
export const COLOR_CHANGE_COOLDOWN_MS = 1000; //after you change 5 tiles, how long before you can enter color change mode again

//Color-changing rules
export const MAX_TILES_COLOR_CHANGE = 5; // how many tiles you can change color of at once
export const TILE_COLOR_CHANGE_MS = 1000; // how long an individual tile takes to change colors before it will accept changing again
export const NUMBER_OF_COLORS = 5; // red, orange, green, blue, purplse

export const TILE_SIZE = 32;
export const FRAME_SIZE = 32;

export const X_DRAW_OFFSET = 16;
export const Y_DRAW_OFFSET = 16;

export const SERVER_TICK_HZ = 20; // TODO make this be "imported" from the authoritative server
export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;

export const BOMB_EXPLODE_TICKS = 0.1 * SERVER_TICK_HZ

export const GARDEN_GROW_SPEED = 1; // how many ticks it takes for a garden to grow. higher is slower