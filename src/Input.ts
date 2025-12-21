import type { Command} from './commands'

export default class Input {
    private down = new Set<string>(); //a set is like an array, but there are no duplicate values. this 'down' variable will contain a Set of all keys that are currently held
    private pressed = new Set<string>(); //a set of keys that were just pressed

    constructor(target: Window = window) {
        target.addEventListener('keydown', (e) => {
            if (!this.down.has(e.key)) this.pressed.add(e.key); // if it's not already "down" then it was just "pressed" this frame
            this.down.add(e.key); // make it down
        });

        target.addEventListener('keyup', (e) => {
            this.down.delete(e.key);
        });
    }

    consumeCommands(): Command[] {
        const cmds: Command[] = [];

        const up = this.down.has('ArrowUp') || this.down.has('w');
        const down = this.down.has('ArrowDown') || this.down.has('s');
        const left = this.down.has('ArrowLeft') || this.down.has('a');
        const right = this.down.has('ArrowRight') || this.down.has('d');

        //one move per frame
        if (up) cmds.push({ type: 'move', dir: 'up'});
        else if (down) cmds.push({ type: 'move', dir: 'down'});
        else if (left) cmds.push({ type: 'move', dir: 'left'});
        else if (right) cmds.push({ type: 'move', dir: 'right'});

        //clear 'pressed' edges
        this.pressed.clear();

        return cmds;
    }
}