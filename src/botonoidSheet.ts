import type {Role, Model, DirType} from './protocol'

//layout constants

const ROLE_ORDER: Role[] = ["goldBot", "pinkBot", "whiteBot", "blackBot"];
const MODEL_ORDER: Model[] = ["alphanoid", "herbanoid", "barvinoid"];
const DIR_ORDER: DirType[] = ["up", "left", "down", "right"];

//sheet dimensions


const SHEET_COLS = 16; // 4 dirs * 4 roles
const SHEET_ROWS = 3;  // 3 models

export const BOT_SHEET = {
    cols: SHEET_COLS , 
    rows: SHEET_ROWS , 
    frameSize: 32, //TODO make this not hardcoded (maybe)
}

function roleToIndex(role: Role): number {
  if (role === "randomBot") return 0;   // fallback
  if (role === "observer") return 0;    // fallback
  const i = ROLE_ORDER.indexOf(role);
  return i >= 0 ? i : 0;
}

function modelToIndex(model: Model): number {
  if (model === "randomnoid") return 0; // fallback
  const i = MODEL_ORDER.indexOf(model);
  return i >= 0 ? i : 0;
}

function dirToIndex(dir: DirType): number {
  const i = DIR_ORDER.indexOf(dir);
  return i >= 0 ? i : 0;
}

export function frameForBot(role: Role, model: Model, dir: DirType): number {
  const r = roleToIndex(role);
  const m = modelToIndex(model);
  const d = dirToIndex(dir);
  return (m * SHEET_COLS) + (r * ROLE_ORDER.length) + d;
}