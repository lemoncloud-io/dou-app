import {
    createLogId,
    createLogUploadQueue,
    createLogUploadScheduler,
    createQueueUploadSource,
    isNative,
    logBuffer,
    logHub,
} from '@chatic/bridges';
import { registerSessionLogoutCallback, uploadLogBatch } from '@chatic/web-core';

import {
    chargeNativeLogQueue,
    clearNativeLogQueue,
    createNativeUploadSource,
    isNativeUploadQueueUnsupported,
} from '../bridge/nativeUploadSource';
import { createLogUploadStore, resolveTabId } from './logUploadStore';
import { createLogUploadSwitch, isLogCollectionEnabled } from './logUploadSwitch';

import type { LogEntry, LogUploadSource } from '@chatic/bridges';

/**
 * Boots the always-on log upload pipeline: every dispatched entry lands in a
 * persistent queue, and batches leave on size, time, or a lifecycle cue.
 *
 * Nothing in here calls `logger`. The upload path must not produce log entries
 * of its own — that is the feedback loop the whole design avoids — so problems
 * here go to `console`.
 */

/**
 * Debounce for queue writes. Persisting per entry meant a full re-serialization
 * and a synchronous localStorage write on every log line — and `NET` logs one
 * per request. Settling, backgrounding and unload all flush immediately, so the
 * window only ever costs entries in a hard crash.
 */
const PERSIST_DEBOUNCE_MS = 1_000;

/**
 * The charge rhythm — web queue → app queue (ADR-0063).
 *
 * Independent of the upload rhythm on purpose. The web can see its own queue
 * synchronously and so can trigger on size; it cannot see the app's queue
 * without a bridge round trip, so the uploader's size trigger reads whatever
 * count the last charge reported instead.
 *
 * The interval is shorter than the upload interval so entries normally reach
 * the app before the uploader looks. Nothing breaks if they do not — they simply
 * ride the next cycle.
 */
const CHARGE_BATCH_SIZE = 50;
const CHARGE_INTERVAL_MS = 30_000;
/** Floor between error-driven charges — mirrors the scheduler's error advance. */
const ERROR_CHARGE_FLOOR_MS = 5_000;

export interface LogUploaderOptions {
    /** Kill switch, read before each send. Defaults to the env + per-device switch. */
    isEnabled?: () => boolean;
}

export interface LogUploaderHandle {
    /** Sends whatever is pending right now. */
    flush(): Promise<void>;
    teardown(): void;
}

export const startLogUploader = (options: LogUploaderOptions = {}): LogUploaderHandle => {
    // Tab-scoped and stable across reloads; a per-load id would leak a key
    // pair on every refresh and strand the previous load's queue.
    const store = createLogUploadStore(resolveTabId(createLogId()));

    const queue = createLogUploadQueue({
        onDrop: dropped => {
            // One line per drop event, not per entry: the queue's own troubles
            // must not become the thing filling the queue.

            console.warn(`[logUploader] dropped ${dropped.length} queued entries under backpressure`);
        },
    });

    let persistTimer: ReturnType<typeof setTimeout> | undefined;

    const persistNow = (): void => {
        if (persistTimer !== undefined) {
            clearTimeout(persistTimer);
            persistTimer = undefined;
        }
        store.save(queue.snapshot());
    };

    const persistSoon = (): void => {
        if (persistTimer !== undefined) return;
        persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    };

    // `load` is called even when this device has opted out: adoption deletes the
    // dead tab's key as it reads it, so skipping it would leave orphan keys
    // behind forever. What is loaded is discarded a few lines below.
    queue.restore(store.load());

    // Entries logged before this subscription exists are only in the ring
    // buffer (it captures from the very first dispatch). Boot-time failures are
    // exactly what this pipeline is for, so seed from it; pushAll dedups by id,
    // so anything already queued is not doubled.
    queue.pushAll(logBuffer.peek());

    const localSource = createQueueUploadSource(queue);
    const nativeSource = createNativeUploadSource();

    /**
     * Whether batches come from the app's queue this cycle.
     *
     * Re-read every time rather than decided once at boot: `NOT_FOUND` is learned
     * from the first real rejection, which can land after the pipeline is already
     * running. Answering stale here would keep the uploader fetching from a queue
     * that does not exist.
     */
    const useNativeSource = (): boolean => isNative() && !isNativeUploadQueueUnsupported();

    /** Size the app reported on the last successful charge — the hybrid size trigger. */
    let appQueueSize = 0;
    // Negative infinity, not 0: the first error must always be allowed to
    // charge, whatever the clock reads.
    let lastErrorChargeAt = Number.NEGATIVE_INFINITY;

    /**
     * Routes between the two sources. The scheduler holds this one object for its
     * whole life and never learns which side answered, which is the point of the
     * port: the hybrid/standalone decision lives here alone.
     */
    const source: LogUploadSource = {
        fetch: limit => (useNativeSource() ? nativeSource.fetch(limit) : localSource.fetch(limit)),
        ack: entries => (useNativeSource() ? nativeSource.ack(entries) : localSource.ack(entries)),
        pendingSize: () => (useNativeSource() ? appQueueSize : localSource.pendingSize?.()),
    };

    /**
     * Hands the web queue's oldest batch to the app.
     *
     * Entries leave the web queue only once the app has taken them. A charge that
     * fails changes nothing — they stay put and ride the next attempt, which is
     * the same at-least-once discipline the upload side uses.
     */
    const chargeNow = async (): Promise<void> => {
        if (!useNativeSource()) return;

        const batch = queue.nextBatch(CHARGE_BATCH_SIZE);
        if (!batch.length) return;

        const size = await chargeNativeLogQueue(batch);
        if (size === undefined) return;

        queue.remove(batch);
        appQueueSize = size;
        persistNow();
    };

    const scheduler = createLogUploadScheduler({
        source,
        isEnabled: options.isEnabled ?? createLogUploadSwitch(),
        send: entries => uploadLogBatch(entries),
        // The scheduler removes accepted (and abandoned) batches itself, so the
        // on-disk copy has to be rewritten after each cycle — otherwise a
        // reload brings back entries the server already took. Harmless in hybrid
        // runs, where the batch came from the app and the web queue is untouched.
        onSettled: persistNow,
        onGiveUp: (entries, attempts) => {
            console.warn(`[logUploader] gave up on ${entries.length} entries after ${attempts} attempts`);
        },
    });

    /**
     * Enforces the device opt-out, returning whether it is on.
     *
     * The build flag and this are different levers: the build flag means "the
     * collector is in trouble, stop sending" and keeps accumulating, while the
     * opt-out means "do not collect on this device" — so what is already stored
     * has to go too, or the control is cosmetic. `logUploadSwitch`'s own
     * documentation has said the queue is discarded since it was written; this is
     * where that finally becomes true.
     *
     * Both stores are cleared. The ring buffer is deliberately left alone: it
     * never leaves the device on its own, and it is what makes a crash report
     * readable.
     */
    const enforceOptOut = (): boolean => {
        if (isLogCollectionEnabled()) return false;

        if (queue.size()) {
            queue.clear();
            persistNow();
        }
        if (isNative()) void clearNativeLogQueue();
        return true;
    };

    const unsubscribe = logHub.subscribe((entry: LogEntry) => {
        // An opted-out device collects nothing: not queued, not written.
        if (!isLogCollectionEnabled()) return;

        queue.push(entry);
        persistSoon();

        if (useNativeSource()) {
            // Size trigger for the charge rhythm. Reading the web queue is
            // synchronous, so this one can be exact — unlike the upload trigger,
            // which has to make do with the count the last charge reported.
            if (queue.sendableSize() >= CHARGE_BATCH_SIZE) {
                void chargeNow();
            } else if (entry.level === 'error') {
                // An error advances the next upload, but the uploader reads the
                // APP queue — an entry still sitting in the web queue is
                // invisible to it. Without this the advance is defeated in
                // hybrid runs: the pulled-in flush finds nothing, and the error
                // waits for the next charge and the cycle after that.
                //
                // Floored like the scheduler's own advance, and for the same
                // reason: an error storm must not become one charge per error.
                const at = Date.now();
                if (at - lastErrorChargeAt >= ERROR_CHARGE_FLOOR_MS) {
                    lastErrorChargeAt = at;
                    void chargeNow();
                }
            }
        }

        scheduler.notify(entry);
    });

    /**
     * Ships everything that can be shipped right now.
     *
     * Charge first: an entry the app has not been given cannot be fetched from
     * it, so skipping this would leave the newest logs behind at exactly the
     * moment they matter most — backgrounding, logout, unload.
     */
    const flush = async (): Promise<void> => {
        if (enforceOptOut()) return;

        await chargeNow();
        await scheduler.flushNow();
        persistNow();
    };

    /** Periodic charge. The upload rhythm runs on the scheduler's own timer. */
    const chargeTimer = setInterval(() => {
        if (enforceOptOut()) return;
        void chargeNow();
    }, CHARGE_INTERVAL_MS);

    /**
     * Logout: ship what we can while the session is still signed, and keep
     * whatever does not make it.
     *
     * The queue is deliberately *not* dropped here. Every entry carries the
     * `uid`/`cid` stamped at dispatch, and the collector hoists its query axes
     * off the entry rather than off the signing session — so a batch that leaves
     * after the next person signs in still lands under the account that produced
     * it. Switching accounts on one device is ordinary here, and clearing would
     * discard exactly the entries a session problem leaves behind: the callback
     * is not awaited, so a synchronous clear after a best-effort flush destroys
     * the only copy a failed send could have retried from.
     */
    const onLogout = (): void => {
        void flush();
    };

    const unregisterLogout = registerSessionLogoutCallback(onLogout);

    // Backgrounding is the last reliable moment to ship: a tab the OS discards
    // never fires pagehide, so visibility is watched too.
    const onHide = (): void => {
        if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = (): void => {
        void flush();
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    // Before the first write, not after: a device that booted already opted out
    // must not have the restored entries land on disk even briefly. When it
    // clears it persists the empty state itself, which is why the write below is
    // in the `else`.
    if (!enforceOptOut()) {
        // Adoption deletes the dead tab's key as it reads it, so the adopted
        // entries live only in memory until this write lands — no debounce here.
        persistNow();
    }

    const stopHeartbeat = store.start();
    scheduler.start();

    return {
        flush,
        teardown() {
            unsubscribe();
            unregisterLogout();
            scheduler.stop();
            clearInterval(chargeTimer);
            stopHeartbeat();
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
            persistNow();
        },
    };
};
