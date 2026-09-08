/**
 * A synchronous "may I fire now?" gate with a minimum gap, optionally growing (ADR-0076 결정 4).
 *
 * **Why this is a second primitive and not part of `Coalescer`.** The runtime's seven hand-rolled
 * concurrency guards are two mechanisms, not one:
 *
 *  - **Coalescing** — share one in-flight attempt among concurrent askers, and every asker gets the
 *    same answer. That is `Coalescer`, and its callers all return a promise.
 *  - **Throttling** — refuse to start at all when the last start was too recent. The caller does not
 *    want an answer, it wants permission; the refusal is "skip this trigger", not "here is a value".
 *
 * Folding them into one class would need a `skipped` sentinel bolted onto every promise-returning
 * caller, and it could not serve the throttle site that is not asynchronous at all: the terminal
 * `expired` resume gate lives inside a socket message handler and answers synchronously. That is the
 * same mistake as folding two unrelated recovery strategies behind one `kind` switch — the thing
 * ADR-0070's guard comments already refused.
 *
 * **The numbers stay with the callers.** Each site's interval is a measured decision (the 60s force
 * refresh floor absorbs a user bouncing between apps; the 30s→5min resume backoff comes from the
 * 2026-08 session audit §5-1, where an unthrottled resume produced an unbounded auth.update stream).
 * This class holds the mechanism, not the policy.
 */
export interface ThrottleOptions {
    /** Minimum gap between two starts. With `maxIntervalMs`, this is the FIRST gap. */
    intervalMs: number;
    /**
     * Present = the gap doubles after each grant, capped here, until {@link Throttle.reset}. Absent =
     * a constant gap.
     */
    maxIntervalMs?: number;
    /** Injectable clock, for tests. Defaults to `Date.now`. */
    now?: () => number;
}

export class Throttle {
    private holdUntil = 0;
    private interval: number;
    private readonly now: () => number;

    constructor(private readonly options: ThrottleOptions) {
        this.interval = options.intervalMs;
        // Wrapped, not captured by reference — see the same note in `coalescer.ts`.
        this.now = options.now ?? (() => Date.now());
    }

    /**
     * True when the caller may fire, and then the next hold is armed. False means "skip this
     * trigger" — the caller does nothing and tries again on its next signal.
     *
     * The FIRST call always grants: a throttle that made the very first attempt wait would turn a
     * cold start into a delay for no reason.
     */
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

    /**
     * Clears the hold and (for a growing throttle) restores the first interval — what a caller does
     * when the thing it was throttling finally succeeded, so a later problem gets a fresh budget.
     */
    reset(): void {
        this.holdUntil = 0;
        this.interval = this.options.intervalMs;
    }
}
