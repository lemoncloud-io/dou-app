import { DEFAULT_BACKOFF_MS, DEFAULT_BATCH_SIZE, DEFAULT_INTERVAL_MS, DEFAULT_MAX_ATTEMPTS } from './uploadPolicy';

import type { TimerHandle, UploadOutcome } from './uploadPolicy';
import type { LogStoreReader } from './LogStore';
import type { LogEntry } from '../core/types';

export interface LogUploadSchedulerOptions {
    /**
     * Where batches come from. In a hybrid run this is the app's store reached
     * over the bridge; standalone it is the local one. The scheduler cannot tell
     * the difference — that is the point. It is a *reader*, so the scheduler has
     * no way to append: principle 16 holds at the type level.
     */
    store: LogStoreReader;
    send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    batchSize?: number;
    intervalMs?: number;
    backoffMs?: number[];
    maxAttempts?: number;
    /** Remote kill switch — checked before every send. */
    isEnabled?: () => boolean;
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
    schedule?: (run: () => void, ms: number) => TimerHandle;
    cancel?: (handle: TimerHandle) => void;
}

/**
 * Decides *when* a batch goes out and what happens when it fails. Pure: the
 * clock, the timer and the actual transport are injected, so every timing rule
 * below is testable without waiting in real time.
 *
 * It runs on its interval and nothing else. There is no `notify` — the
 * scheduler does not observe dispatched entries at all, which is what makes
 * "the hub's subscribers are the listeners, and only the listeners" true without
 * any wiring to enforce it (principle 16). The size and error triggers this used
 * to carry are gone with it: an `error` now waits for the next tick like
 * everything else, and the thing that needs to react immediately — Crashlytics —
 * is a listener, so it already does.
 *
 * `flushNow()` is the one way to send off-schedule. It is a lifecycle cue
 * (pagehide, logout), not a trigger, and it is only meaningful web-standalone:
 * in a hybrid run the app owns the store and the web is not the process that
 * learns it is dying. What prevents loss there is the store being durable, not
 * the flush.
 *
 * Failures back off, and a batch that keeps failing is eventually dropped so the
 * client always terminates regardless of the status code it is given.
 */
export class LogUploadScheduler {
    private readonly store: LogStoreReader;
    private readonly send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    private readonly batchSize: number;
    private readonly intervalMs: number;
    private readonly backoffMs: number[];
    private readonly maxAttempts: number;
    private readonly isEnabled?: () => boolean;
    private readonly onGiveUp?: (entries: LogEntry[], attempts: number) => void;
    private readonly onSettled?: () => void;
    private readonly scheduleTimer: (run: () => void, ms: number) => TimerHandle;
    private readonly cancelTimer: (handle: TimerHandle) => void;

    private timer?: TimerHandle;
    private running = false;
    private inFlight = false;
    private attempts = 0;

    constructor(options: LogUploadSchedulerOptions) {
        this.store = options.store;
        this.send = options.send;
        this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.isEnabled = options.isEnabled;
        this.onGiveUp = options.onGiveUp;
        this.onSettled = options.onSettled;
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

    /**
     * Sends now, off-schedule. A lifecycle cue (pagehide, logout) rather than a
     * trigger — see the class note on why it is web-standalone only.
     */
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
            await this.store.ack(batch);
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
            let batch: LogEntry[];
            try {
                batch = await this.store.peek(this.batchSize);
            } catch {
                // The store is unreachable this cycle (a bridge round trip that
                // timed out, say). Nothing is lost — it never released anything —
                // so treat it like an empty cycle and come back on the timer.
                this.armTimer(this.intervalMs);
                return;
            }

            // Nothing to send: skip the request entirely rather than posting an
            // empty batch. An idle device would otherwise call the collector once
            // per interval forever.
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
