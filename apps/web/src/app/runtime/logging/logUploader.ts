import {
    createLogId,
    createLogUploadQueue,
    createLogUploadScheduler,
    createQueueLogStore,
    isNative,
    logHub,
} from '@chatic/bridges';
import { registerSessionLogoutCallback } from '@chatic/app-runtime';
import { uploadLogBatch } from '@chatic/app-runtime';

import { clearNativeLogQueue, createNativeUploadSource, isNativeUploadQueueUnsupported } from './nativeUploadSource';
import { registerLogQueueView } from './logQueueView';
import { createLogUploadStore, resolveTabId } from './logUploadStore';
import { createLogUploadSwitch, isLogCollectionEnabled } from './logUploadSwitch';

import type { LogEntry, LogStoreReader } from '@chatic/bridges';

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

export interface LogUploaderOptions {
    /** Kill switch, read before each send. Defaults to the env + per-device switch. */
    isEnabled?: () => boolean;
    /**
     * Whether `debug` is stored (and therefore visible in the debug monitor).
     *
     * Passed in rather than read here because this module must not touch
     * `import.meta` — doing so makes it unloadable under the test transform.
     * The caller reads the build flag and hands it over.
     */
    keepDebug?: boolean;
}

export interface LogUploaderHandle {
    /** Sends whatever is pending right now. */
    flush(): Promise<void>;
    teardown(): void;
}

export const startLogUploader = (options: LogUploaderOptions = {}): LogUploaderHandle => {
    /**
     * Which side owns the store, decided once.
     *
     * Whether the *app* can serve a store is a separate question, learned rather
     * than known — see `useAppStore` below.
     */
    const hybrid = isNative();

    // Tab-scoped and stable across reloads; a per-load id would leak a key
    // pair on every refresh and strand the previous load's queue.
    const store = createLogUploadStore(resolveTabId(createLogId()));

    const queue = createLogUploadQueue({
        acceptDebug: options.keepDebug ?? false,
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

    const localStore = createQueueLogStore(queue);
    const appStore = createNativeUploadSource();

    /**
     * Whether the app is serving the store this cycle.
     *
     * Hybrid alone is not enough to answer. The messages this reads through
     * (`FetchLogUploadQueue` and friends) ship with the app, and the web ships
     * first — so a hybrid run against an app that predates them has no app store
     * to read, and `nativeUploadSource` learns that from the first `NOT_FOUND`.
     * Until it does, hybrid is assumed.
     */
    const useAppStore = (): boolean => hybrid && !isNativeUploadQueueUnsupported();

    /**
     * Whether the local queue is still being filled.
     *
     * True at boot on every platform, including hybrid. That is a deliberate
     * softening of "the web stores nothing in a hybrid run": the rule holds once
     * the app has answered, but it cannot hold *before* that, because the answer
     * arrives a cycle or more after the first entries are dispatched. Assuming
     * the app can serve and being wrong would lose exactly the boot window — the
     * part of a session that explains the rest of it.
     *
     * So the web keeps a copy until the app proves it owns the store, then drops
     * it (`standDownLocalStore`). On an app that cannot serve, this copy is not a
     * copy at all — it is the only one, and the pipeline runs standalone.
     */
    let fillingLocalStore = true;

    /**
     * Called once the app has answered a read: the copy kept for the boot window
     * is redundant, because every entry in it was also relayed across as it was
     * dispatched and is sitting in the app's store.
     */
    const standDownLocalStore = (): void => {
        if (!fillingLocalStore) return;
        fillingLocalStore = false;
        queue.clear();
        persistNow();
    };

    /**
     * Routes reads to whichever side owns the store.
     *
     * The check is per call rather than once at boot because the answer is
     * learned, not known — and it only ever moves one way, from "assume the app"
     * to "the app cannot", so there is no flapping to guard against.
     */
    const logStore: LogStoreReader = {
        peek: async limit => {
            if (useAppStore()) {
                const batch = await appStore.peek(limit);
                // Still true after the call means the app answered rather than
                // rejecting: it owns the store, so the boot-window copy can go.
                if (useAppStore()) {
                    standDownLocalStore();
                    return batch;
                }
                // Otherwise the NOT_FOUND was just learned — fall through and
                // send what the local queue has been holding since boot.
            }
            return localStore.peek(limit);
        },
        ack: entries => (useAppStore() ? appStore.ack(entries) : localStore.ack(entries)),
        clear: () => (useAppStore() ? appStore.clear() : localStore.clear()),
        size: () => (useAppStore() ? appStore.size() : localStore.size()),
    };

    const scheduler = createLogUploadScheduler({
        store: logStore,
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
     * Both queues are cleared — the web's own and, in a hybrid run, the app's.
     * There is nothing else to clear: the queue is the only log store, so an
     * opt-out has no exception to carve out any more.
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

    /**
     * The listener that stores.
     *
     * It does one thing: hand the entry to the queue and note that the on-disk
     * copy is stale. No level filter (the queue owns that), no upload decision
     * (the scheduler owns that), no bridge (the sender owns that). Keeping it
     * this thin is what lets a fourth listener be added later without reading
     * anyone else's ordering.
     *
     * It runs in hybrid too, until `standDownLocalStore` stops it. In a hybrid
     * run against a capable app the entries it keeps are duplicates — every one
     * of them was relayed across as it was dispatched — and they are discarded
     * as soon as the app answers a read. Against an app that cannot serve a
     * store, they are the only copy there is.
     */
    const unsubscribeStore = logHub.subscribe((entry: LogEntry) => {
        // An opted-out device collects nothing: not queued, not written.
        if (!isLogCollectionEnabled()) return;
        if (!fillingLocalStore) return;

        queue.push(entry);
        persistSoon();
    });

    /**
     * Ships everything that can be shipped right now.
     *
     * There is nothing to hand across first any more: entries reach the app as
     * they are dispatched, so by the time this runs the app already holds them.
     * What this does is ask the store for a batch and send it.
     *
     * Only meaningful web-standalone. In hybrid the uploader lives in the tab but
     * the store does not, and the tab is not the process that learns it is dying
     * — what prevents loss there is the app's store being durable, not this.
     */
    const flush = async (): Promise<void> => {
        if (enforceOptOut()) return;

        await scheduler.flushNow();
        persistNow();
    };

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

    // The debug monitor reads through this rather than holding the queue: the
    // uploader stays the only writer.
    const unregisterView = registerLogQueueView({
        snapshot: () => queue.snapshot(),
        clear: () => {
            queue.clear();
            persistNow();
        },
    });

    const stopHeartbeat = store.start();
    // One rhythm now: the scheduler's periodic upload. The charge pump's second
    // timer went with the batched hop.
    scheduler.start();

    return {
        flush,
        teardown() {
            unsubscribeStore();
            unregisterView();
            unregisterLogout();
            scheduler.stop();
            stopHeartbeat();
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
            persistNow();
        },
    };
};
