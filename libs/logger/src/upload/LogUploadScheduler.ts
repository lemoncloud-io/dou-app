import {
    DEFAULT_BACKOFF_MS,
    DEFAULT_BATCH_SIZE,
    DEFAULT_ERROR_ADVANCE_MS,
    DEFAULT_INTERVAL_MS,
    DEFAULT_MAX_ATTEMPTS,
} from './uploadPolicy';

import type { TimerHandle, UploadOutcome } from './uploadPolicy';
import type { LogUploadSource } from './LogUploadSource';
import type { LogEntry } from '../core/types';

export interface LogUploadSchedulerOptions {
    /**
     * Where batches come from. In a hybrid run this is the native shell's queue
     * reached over the bridge; standalone (and on any fallback) it is the local
     * queue. The scheduler cannot tell the difference — that is the point.
     */
    source: LogUploadSource;
    send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    batchSize?: number;
    intervalMs?: number;
    errorAdvanceMs?: number;
    backoffMs?: number[];
    maxAttempts?: number;
    /** Remote kill switch — checked before every send. */
    isEnabled?: () => boolean;
    /**
     * Runs before a batch is composed, on every flush including the periodic
     * one. The hybrid uploader drains the native buffer here; wiring that only
     * into the caller's own flush would leave native entries unsent for the
     * whole time an app stays in the foreground.
     */
    beforeFlush?: () => Promise<void>;
    /** Called once when a batch exhausts its attempts and is dropped. */
    onGiveUp?: (entries: LogEntry[], attempts: number) => void;
    /**
     * Called after every send cycle, once the queue has been mutated.
     *
     * The owner persists here. Removing a batch happens inside this module, so
     * without a hook the on-disk copy would still list entries the server has
     * already taken — and a reload would resurrect them.
     */
    onSettled?: () => void;
    now?: () => number;
    schedule?: (run: () => void, ms: number) => TimerHandle;
    cancel?: (handle: TimerHandle) => void;
}

/**
 * Decides *when* a batch goes out and what happens when it fails. Pure: the
 * clock, the timer and the actual transport are injected, so every timing rule
 * below is testable without waiting in real time.
 *
 * The rules exist to keep a batching pipeline from degenerating into a
 * per-entry one:
 * - a flush needs enough to send, enough time, or an explicit lifecycle cue;
 * - an error brings the next batch forward but never sends on its own;
 * - failures back off, and a batch that keeps failing is eventually dropped so
 *   the client always terminates regardless of the status code it is given.
 */
export class LogUploadScheduler {
    private readonly source: LogUploadSource;
    private readonly send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    private readonly batchSize: number;
    private readonly intervalMs: number;
    private readonly errorAdvanceMs: number;
    private readonly backoffMs: number[];
    private readonly maxAttempts: number;
    private readonly isEnabled?: () => boolean;
    private readonly beforeFlush?: () => Promise<void>;
    private readonly onGiveUp?: (entries: LogEntry[], attempts: number) => void;
    private readonly onSettled?: () => void;
    private readonly now: () => number;
    private readonly scheduleTimer: (run: () => void, ms: number) => TimerHandle;
    private readonly cancelTimer: (handle: TimerHandle) => void;

    private timer?: TimerHandle;
    private running = false;
    private inFlight = false;
    private attempts = 0;
    // Negative infinity, not 0: the first error must always be allowed to
    // advance, whatever origin the injected clock counts from.
    private lastAdvanceAt = Number.NEGATIVE_INFINITY;

    constructor(options: LogUploadSchedulerOptions) {
        this.source = options.source;
        this.send = options.send;
        this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        this.errorAdvanceMs = options.errorAdvanceMs ?? DEFAULT_ERROR_ADVANCE_MS;
        this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.isEnabled = options.isEnabled;
        this.beforeFlush = options.beforeFlush;
        this.onGiveUp = options.onGiveUp;
        this.onSettled = options.onSettled;
        this.now = options.now ?? (() => Date.now());
        this.scheduleTimer = options.schedule ?? ((run, ms) => setTimeout(run, ms));
        this.cancelTimer = options.cancel ?? (handle => clearTimeout(handle));
    }

    /** Starts the periodic timer. */
    public start(): void {
        if (this.running) return;
        this.running = true;
        this.armTimer(this.intervalMs);
    }

    /** Stops timers; does not touch the queue. */
    public stop(): void {
        this.running = false;
        this.clearTimer();
    }

    /** Records a newly queued entry so size and error triggers can fire. */
    public notify(entry: LogEntry): void {
        if (!this.running) return;

        // Nothing jumps the backoff. The ladder is meant to space attempts
        // out in TIME, but a busy app reaches the size threshold again
        // within milliseconds of a failure — so without this guard all five
        // attempts burn instantly and the batch is given up on, turning a
        // brief server blip into permanent log loss.
        if (this.isBackingOff()) return;

        // A source that cannot answer synchronously (a bridge one) leaves the
        // size trigger out entirely — asking would cost a round trip per log
        // line. The periodic flush and the lifecycle cues still deliver.
        const pending = this.source.pendingSize?.();
        if (pending !== undefined && pending >= this.batchSize) {
            void this.flush();
            return;
        }

        if (entry.level !== 'error') return;

        // Bring the next batch forward, but not more often than the floor
        // and never to zero — an error storm would otherwise turn into one
        // request per error, which is what batching is for.
        const at = this.now();
        if (at - this.lastAdvanceAt < this.errorAdvanceMs) return;
        this.lastAdvanceAt = at;
        this.armTimer(this.errorAdvanceMs);
    }

    /** Sends now if there is anything to send (background entry, pagehide). */
    public flushNow(): Promise<void> {
        return this.flush();
    }

    private clearTimer(): void {
        if (this.timer === undefined) return;
        this.cancelTimer(this.timer);
        this.timer = undefined;
    }

    private armTimer(ms: number): void {
        if (!this.running) return;
        this.clearTimer();
        this.timer = this.scheduleTimer(() => {
            this.timer = undefined;
            void this.flush();
        }, ms);
    }

    /** True while retrying a failed batch — error advances must not interfere. */
    private isBackingOff(): boolean {
        return this.attempts > 0;
    }

    /**
     * Releases a batch the pipeline is done with.
     *
     * A failure here is deliberately swallowed. The source still holds the
     * entries, so the next cycle re-fetches and resends them — at-least-once,
     * which the server's id upsert already absorbs. Throwing instead would
     * abort the cycle without arming the next timer and stall the pipeline for
     * good, trading a duplicate request for permanent silence.
     */
    private async release(batch: LogEntry[]): Promise<void> {
        try {
            await this.source.ack(batch);
        } catch {
            /* keep going — the entries stay put and ride the next batch */
        }
    }

    private async settle(outcome: 'done' | 'retry', batch: LogEntry[]): Promise<void> {
        if (outcome === 'done') {
            this.attempts = 0;
            this.armTimer(this.intervalMs);
            this.onSettled?.();
            return;
        }

        this.attempts += 1;

        if (this.attempts >= this.maxAttempts) {
            // Give up on THIS batch so the pipeline can move on. The entries are
            // released rather than left in the source: leaving them would make
            // the same content eligible forever, which is the endless resend
            // this cap exists to prevent.
            //
            // It has to be the batch that actually failed, not a freshly
            // composed one — entries that arrived during the backoff window
            // were never attempted and must not be discarded with it.
            await this.release(batch);
            this.onGiveUp?.(batch, this.attempts);
            this.attempts = 0;
            this.armTimer(this.intervalMs);
            this.onSettled?.();
            return;
        }

        this.armTimer(this.backoffMs[Math.min(this.attempts - 1, this.backoffMs.length - 1)]);
        this.onSettled?.();
    }

    private async flush(): Promise<void> {
        if (!this.running || this.inFlight) return;

        if (this.isEnabled && !this.isEnabled()) {
            // Switched off: keep accumulating, just do not send.
            this.armTimer(this.intervalMs);
            return;
        }

        // Held for the WHOLE cycle, not just the send. `fetch` is non-destructive
        // by contract, so two overlapping flushes would draw the same batch and
        // send it twice — the server's id upsert would keep storage clean, but
        // the bandwidth and the doubled attempt count are still ours to pay.
        this.inFlight = true;
        try {
            if (this.beforeFlush) {
                try {
                    await this.beforeFlush();
                } catch {
                    // A failed pre-step is not fatal — send what the source holds.
                }
            }

            let batch: LogEntry[];
            try {
                batch = await this.source.fetch(this.batchSize);
            } catch {
                // The source is unreachable this cycle (a bridge round trip that
                // timed out, say). Nothing is lost — it never released anything —
                // so treat it like an empty cycle and come back on the timer.
                this.armTimer(this.intervalMs);
                return;
            }

            if (!batch.length) {
                this.armTimer(this.intervalMs);
                return;
            }

            try {
                const outcome = await this.send(batch);

                if (outcome === 'retry') {
                    await this.settle('retry', batch);
                    return;
                }

                // 'ok' and 'discard' both end this batch's life; the difference
                // is only whether the server stored it.
                await this.release(batch);
                await this.settle('done', batch);
            } catch {
                // A transport that rejects is indistinguishable from a 5xx here.
                await this.settle('retry', batch);
            }
        } finally {
            this.inFlight = false;
        }
    }
}

/** Convenience factory, kept for call sites that read better without `new`. */
export const createLogUploadScheduler = (options: LogUploadSchedulerOptions): LogUploadScheduler =>
    new LogUploadScheduler(options);
