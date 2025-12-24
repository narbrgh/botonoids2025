import type { Command } from './commands';
import type { Controller, Dir } from './Controller';

export type KeyMap = {
    up: string[];
    down: string[];
    left: string[];
    right: string[];
    action: string[]; //edge-triggered
    changeItem: string[]; //edge-triggered
    useItem: string[]; //edge-triggered
};

export default class KeyboardController implements Controller {
    private down = new Set<string>();
    private pressed = new Set<string>();
    private dirStack: Dir[] = [];

    private readonly keyMap: KeyMap;

    constructor(keyMap: KeyMap, target: Window = window) {
        this.keyMap = keyMap;

        target.addEventListener('keydown', (e) => {
            const key = e.key;

            //prevent browser scrolling on arrows/space
            if (this.isMovementOrActionKey(key)) e.preventDefault();

            if (this.down.has(key)) return; // ignore key-repeat
            this.down.add(key);
            this.pressed.add(key);

            const dir = this.keyToDir(key);
            if (dir) {
                //make most recent direction win
                this.dirStack = this.dirStack.filter(d => d !== dir); //TODO understand this line
                this.dirStack.push(dir);

            }
        });

        target.addEventListener('keyup', (e) => {
            const key = e.key;
            this.down.delete(key);

            const dir = this.keyToDir(key)
            if(dir) {
                this.dirStack = this.dirStack.filter(d => d !== dir);
            }
        });
    }

    getMoveIntent(): Dir | null {
        return this.dirStack.length ? this.dirStack[this.dirStack.length - 1] : null;
    }

    consumeCommands(): Command[] {
        const cmds: Command[] = [];

        if (this.anyPressed(this.keyMap.action)) cmds.push({type: 'action' });
        if (this.anyPressed(this.keyMap.changeItem)) cmds.push({type: 'changeItem' });
        if (this.anyPressed(this.keyMap.useItem)) cmds.push({type: 'useItem' });

        this.pressed.clear();
        return cmds;
    }
    
    // ------ helpers --------
    private anyPressed(keys: string[]): boolean {
        return keys.some(k => this.pressed.has(k));
    }

    private keyToDir(key: string): Dir | null {
        if (this.keyMap.up.includes(key)) return 'up';
        if (this.keyMap.down.includes(key)) return 'down';
        if (this.keyMap.left.includes(key)) return 'left';
        if (this.keyMap.right.includes(key)) return 'right';
        return null;
    }

    private isMovementOrActionKey(key: string): boolean {
        return (
            this.keyMap.up.includes(key) ||
            this.keyMap.down.includes(key) ||
            this.keyMap.left.includes(key) ||
            this.keyMap.right.includes(key) ||
            this.keyMap.action.includes(key) 
        );
    }


}