import type { KeyMap } from "./KeyboardController";

export const P1_KEYS: KeyMap = {
    up: ['w', 'W'],
    down: ['s','S'],
    left: ['a', 'A'],
    right: ['d','D'],
    action: [' '],
    changeItem: ['q','Q'],
    useItem: ['e','E'],
};

export const P2_KEYS: KeyMap = {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    action: ['Space', ' '],
    changeItem: ['Shift'],
    useItem: ['Control','e','E'],
};
