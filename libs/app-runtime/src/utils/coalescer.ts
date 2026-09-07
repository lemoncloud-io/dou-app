/**
 * Shares one in-flight attempt among concurrent askers, and optionally lets a just-settled answer
 * serve the next caller for a moment (ADR-0074 결정 4).
 *
 * Generalized from `RelayRefreshCoalescer`, which was the only one of the runtime's seven
 * hand-rolled concurrency guards that had grown into a real class. The other coalescing sites were
 * module-level `let inFlight` or a `useRef` — same mechanism, six different spellings, so "can this
 * fire twice?" meant reading all of them.
 *
 * **`memoMs` is a burst absorber, not a cache.** Both readings of a settled answer hold only briefly:
 * a success means the work just happened, a failure means the reason has not changed in the last
 * few milliseconds. Anything longer starts answering for a state it can no longer vouch for, and the
 * honest recovery for that is to actually ask again. Omit it when only in-flight sharing is wanted.
 *
 * Rejections are NOT memoized: `run` propagates them and clears the slot, because an exception is
 * the attempt failing to produce an answer at all — the next caller deserves a fresh attempt.
 */
export interface CoalescerOptions {
    /** How long a settled result answers for the next caller. Omitted/0 = no memo. */
    memoMs?: number;
    /** Injectable clock, for tests. Defaults to `Date.now`. */
    now?: () => number;
}

export class Coalescer<T> {
    private inFlight: Promise<T> | null = null;
    private lastResult: { at: number; value: T } | null = null;
    private readonly memoMs: number;
    private readonly now: () => number;

    constructor(options: CoalescerOptions = {}) {
        this.memoMs = options.memoMs ?? 0;
        // Wrapped, not `Date.now` captured by reference: a reference taken at construction keeps
        // pointing at the ORIGINAL function, so a test that installs fake timers afterwards (jest's
        // modern timers replace the global `Date.now`) would advance a clock this class never reads.
        // The pre-refactor code called `Date.now()` inline and picked the fake up; keep that.
        this.now = options.now ?? (() => Date.now());
    }

    /** Runs `attempt`, or hands back the shared in-flight promise / the memoized answer. */
    run(attempt: () => Promise<T>): Promise<T> {
        if (this.inFlight) {
            return this.inFlight;
        }
        if (this.memoMs > 0 && this.lastResult && this.now() - this.lastResult.at < this.memoMs) {
            return Promise.resolve(this.lastResult.value);
        }

        // Started synchronously — nothing awaits before the field write — so an attempt is registered
        // before any caller in the same tick can look for one. Two callers resolving in one microtask
        // queue must find each other.
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

    /** Test seam: a case must not inherit the previous one's shared attempt or memoized answer. */
    reset(): void {
        this.inFlight = null;
        this.lastResult = null;
    }
}
