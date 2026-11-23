export interface ThrottleOptions {
    intervalMs: number;
    maxIntervalMs?: number;
    now?: () => number;
}

export class Throttle {
    private holdUntil = 0;
    private interval: number;
    private readonly now: () => number;

    constructor(private readonly options: ThrottleOptions) {
        this.interval = options.intervalMs;
        this.now = options.now ?? (() => Date.now());
    }

    tryAcquire(): boolean {
        const now = this.now();
        if (now < this.holdUntil) {
            return false;
        }
        this.holdUntil = now + this.interval;
        if (this.options.maxIntervalMs != null) {
            this.interval = Math.min(this.interval * 2, this.options.maxIntervalMs);
        }
        return true;
    }

    reset(): void {
        this.holdUntil = 0;
        this.interval = this.options.intervalMs;
    }
}
