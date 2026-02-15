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

type KeyboardControllerOptions = {
    isEnabled?: () => boolean;
};

export default class KeyboardController implements Controller {
    private down = new Set<string>();
    private pressed = new Set<string>();
    private dirStack: Dir[] = [];

    //queued command - used for the action and item buttons which can be either pressed, released, or held,
    // and the server has to know which of those is true
    private queued: Command[] = [];

    private readonly keyMap: KeyMap;
    private readonly isEnabled: () => boolean;

    constructor(keyMap: KeyMap, target: Window = window, options: KeyboardControllerOptions = {}) {
        this.keyMap = keyMap;
        this.isEnabled = options.isEnabled ?? (() => true);

        target.addEventListener('keydown', (e) => {
            if (this.shouldIgnoreEventTarget(e.target)) return;
            if (!this.isEnabled()) {
                this.resetState();
                return;
            }

            const key = e.key;

            //prevent browser scrolling on arrows/space
            if (this.isMovementOrActionKey(key)) e.preventDefault();

            if (this.down.has(key)) return; // ignore key-repeat
            this.down.add(key);
            this.pressed.add(key);

            if (this.keyMap.action.includes(key)) {
                this.queued.push({ type: 'actionDown'})
            }

            const dir = this.keyToDir(key);
            if (dir) {
                //make most recent direction win
                this.dirStack = this.dirStack.filter(d => d !== dir); //TODO understand this line
                this.dirStack.push(dir);
            }



        });

        target.addEventListener('keyup', (e) => {
            if (this.shouldIgnoreEventTarget(e.target)) return;
            const key = e.key;
            this.down.delete(key);
            if (!this.isEnabled()) {
                const dir = this.keyToDir(key);
                if (dir) this.dirStack = this.dirStack.filter(d => d !== dir);
                return;
            }

            if (this.keyMap.action.includes(key)) {
                this.queued.push({ type: 'actionUp'})
            }

            const dir = this.keyToDir(key)
            if(dir) {
                this.dirStack = this.dirStack.filter(d => d !== dir);
            }
        });
    }

    getMoveIntent(): Dir | null {
        if (!this.isEnabled()) {
            this.resetState();
            return null;
        }
        return this.dirStack.length ? this.dirStack[this.dirStack.length - 1] : null;
    }

    consumeCommands(): Command[] {
        if (!this.isEnabled()) {
            this.resetState();
            return [];
        }
        const cmds: Command[] = [];

        //drain queued edge commands
        cmds.push(...this.queued);
        this.queued.length = 0;
        
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

    private shouldIgnoreEventTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return target.isContentEditable;
    }

    private resetState(): void {
        this.down.clear();
        this.pressed.clear();
        this.dirStack = [];
        this.queued.length = 0;
    }

}
