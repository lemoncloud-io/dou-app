export interface CoalescerOptions {
    memoMs?: number;
    now?: () => number;
}

export class Coalescer<T> {
    private inFlight: Promise<T> | null = null;
    private lastResult: { at: number; value: T } | null = null;
    private readonly memoMs: number;
    private readonly now: () => number;

    constructor(options: CoalescerOptions = {}) {
        this.memoMs = options.memoMs ?? 0;
        this.now = options.now ?? (() => Date.now());
    }

    run(attempt: () => Promise<T>): Promise<T> {
        if (this.inFlight) {
            return this.inFlight;
        }
        if (this.memoMs > 0 && this.lastResult && this.now() - this.lastResult.at < this.memoMs) {
            return Promise.resolve(this.lastResult.value);
        }

        const running = attempt()
            .then(value => {
                if (this.memoMs > 0) this.lastResult = { at: this.now(), value };
                return value;
            })
            .finally(() => {
                this.inFlight = null;
            });

        this.inFlight = running;
        return running;
    }

    forgetResult(): void {
        this.lastResult = null;
    }

    reset(): void {
        this.inFlight = null;
        this.lastResult = null;
    }
}
