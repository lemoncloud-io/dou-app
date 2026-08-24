import type { LogEntry } from './types';
import type { LogUploadSource } from './uploadSource';

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

/** What the server's answer means for the batch that was sent. */
export type UploadOutcome =
    /** 2xx — accepted (individually dropped items included). Remove the batch. */
    | 'ok'
    /** 4xx — the request will never succeed as-is. Discard without retrying. */
    | 'discard'
    /** 5xx or transport failure — worth another attempt. */
    | 'retry';

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_INTERVAL_MS = 60_000;
/** An error pulls the next batch in to this delay — not to zero. */
export const DEFAULT_ERROR_ADVANCE_MS = 5_000;
export const DEFAULT_BACKOFF_MS = [5_000, 30_000, 120_000];
/**
 * Attempts for one batch before it is given up on.
 *
 * This is what guarantees termination. Without it a server that answers 5xx to
 * something it will never accept — an expired session, say — would have the
 * client resending the same batch forever. With it the client stops on its own,
 * so termination does not depend on the server choosing 4xx over 5xx.
 */
export const DEFAULT_MAX_ATTEMPTS = 5;

export type TimerHandle = ReturnType<typeof setTimeout>;

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

export interface LogUploadScheduler {
    /** Starts the periodic timer. */
    start(): void;
    /** Stops timers; does not touch the queue. */
    stop(): void;
    /** Records a newly queued entry so size and error triggers can fire. */
    notify(entry: LogEntry): void;
    /** Sends now if there is anything to send (background entry, pagehide). */
    flushNow(): Promise<void>;
}

export const createLogUploadScheduler = (options: LogUploadSchedulerOptions): LogUploadScheduler => {
    const {
        source,
        send,
        batchSize = DEFAULT_BATCH_SIZE,
        intervalMs = DEFAULT_INTERVAL_MS,
        errorAdvanceMs = DEFAULT_ERROR_ADVANCE_MS,
        backoffMs = DEFAULT_BACKOFF_MS,
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        isEnabled,
        beforeFlush,
        onGiveUp,
        onSettled,
        now = () => Date.now(),
        schedule = (run, ms) => setTimeout(run, ms),
        cancel = handle => clearTimeout(handle),
    } = options;

    let timer: TimerHandle | undefined;
    let running = false;
    let inFlight = false;
    let attempts = 0;
    // Negative infinity, not 0: the first error must always be allowed to
    // advance, whatever origin the injected clock counts from.
    let lastAdvanceAt = Number.NEGATIVE_INFINITY;

    const clearTimer = (): void => {
        if (timer === undefined) return;
        cancel(timer);
        timer = undefined;
    };

    const armTimer = (ms: number): void => {
        if (!running) return;
        clearTimer();
        timer = schedule(() => {
            timer = undefined;
            void flush();
        }, ms);
    };

    /** True while retrying a failed batch — error advances must not interfere. */
    const isBackingOff = (): boolean => attempts > 0;

    /**
     * Releases a batch the pipeline is done with.
     *
     * A failure here is deliberately swallowed. The source still holds the
     * entries, so the next cycle re-fetches and resends them — at-least-once,
     * which the server's id upsert already absorbs. Throwing instead would
     * abort the cycle without arming the next timer and stall the pipeline for
     * good, trading a duplicate request for permanent silence.
     */
    const release = async (batch: LogEntry[]): Promise<void> => {
        try {
            await source.ack(batch);
        } catch {
            /* keep going — the entries stay put and ride the next batch */
        }
    };

    const settle = async (outcome: 'done' | 'retry', batch: LogEntry[]): Promise<void> => {
        if (outcome === 'done') {
            attempts = 0;
            armTimer(intervalMs);
            onSettled?.();
            return;
        }

        attempts += 1;

        if (attempts >= maxAttempts) {
            // Give up on THIS batch so the pipeline can move on. The entries are
            // released rather than left in the source: leaving them would make
            // the same content eligible forever, which is the endless resend
            // this cap exists to prevent.
            //
            // It has to be the batch that actually failed, not a freshly
            // composed one — entries that arrived during the backoff window
            // were never attempted and must not be discarded with it.
            await release(batch);
            onGiveUp?.(batch, attempts);
            attempts = 0;
            armTimer(intervalMs);
            onSettled?.();
            return;
        }

        armTimer(backoffMs[Math.min(attempts - 1, backoffMs.length - 1)]);
        onSettled?.();
    };

    const flush = async (): Promise<void> => {
        if (!running || inFlight) return;

        if (isEnabled && !isEnabled()) {
            // Switched off: keep accumulating, just do not send.
            armTimer(intervalMs);
            return;
        }

        // Held for the WHOLE cycle, not just the send. `fetch` is non-destructive
        // by contract, so two overlapping flushes would draw the same batch and
        // send it twice — the server's id upsert would keep storage clean, but
        // the bandwidth and the doubled attempt count are still ours to pay.
        inFlight = true;
        try {
            if (beforeFlush) {
                try {
                    await beforeFlush();
                } catch {
                    // A failed pre-step is not fatal — send what the source holds.
                }
            }

            let batch: LogEntry[];
            try {
                batch = await source.fetch(batchSize);
            } catch {
                // The source is unreachable this cycle (a bridge round trip that
                // timed out, say). Nothing is lost — it never released anything —
                // so treat it like an empty cycle and come back on the timer.
                armTimer(intervalMs);
                return;
            }

            if (!batch.length) {
                armTimer(intervalMs);
                return;
            }

            try {
                const outcome = await send(batch);

                if (outcome === 'retry') {
                    await settle('retry', batch);
                    return;
                }

                // 'ok' and 'discard' both end this batch's life; the difference
                // is only whether the server stored it.
                await release(batch);
                await settle('done', batch);
            } catch {
                // A transport that rejects is indistinguishable from a 5xx here.
                await settle('retry', batch);
            }
        } finally {
            inFlight = false;
        }
    };

    return {
        start() {
            if (running) return;
            running = true;
            armTimer(intervalMs);
        },

        stop() {
            running = false;
            clearTimer();
        },

        notify(entry) {
            if (!running) return;

            // Nothing jumps the backoff. The ladder is meant to space attempts
            // out in TIME, but a busy app reaches the size threshold again
            // within milliseconds of a failure — so without this guard all five
            // attempts burn instantly and the batch is given up on, turning a
            // brief server blip into permanent log loss.
            if (isBackingOff()) return;

            // A source that cannot answer synchronously (a bridge one) leaves the
            // size trigger out entirely — asking would cost a round trip per log
            // line. The periodic flush and the lifecycle cues still deliver.
            const pending = source.pendingSize?.();
            if (pending !== undefined && pending >= batchSize) {
                void flush();
                return;
            }

            if (entry.level !== 'error') return;

            // Bring the next batch forward, but not more often than the floor
            // and never to zero — an error storm would otherwise turn into one
            // request per error, which is what batching is for.
            const at = now();
            if (at - lastAdvanceAt < errorAdvanceMs) return;
            lastAdvanceAt = at;
            armTimer(errorAdvanceMs);
        },

        flushNow: () => flush(),
    };
};
