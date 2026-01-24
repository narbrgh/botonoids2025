export default class ServerClock {
    private lastTick = 0;
    private lastAtMs = 0;
    private tickMs = 1000 / 20; //20 is hardcoded, but gets updated in updateConfig

    updateSnapshot(tick: number, receivedAtMs: number) {
        this.lastTick = tick;
        this.lastAtMs = receivedAtMs;
    }

    updateConfig(tickHz: number) {
        this.tickMs = 1000 / tickHz;
    }

    estimatedTick(nowMs: number): number {
        const dt = nowMs - this.lastAtMs;
        return this.lastTick + dt / this.tickMs;
    }
}