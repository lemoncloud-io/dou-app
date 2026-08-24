import type { WebMessageData } from '@chatic/app-messages';
import type { LogListener } from '@chatic/logger';

import { NativeBridgeAdapter } from '../web/adapters';
import { toAppLogInfo } from './toAppLogInfo';

/**
 * Creates a hub listener that forwards `info` and above to the native app via
 * the `SendLog` bridge message — `debug` is deliberately not relayed (see the
 * gate below). The original occurrence `timestamp` and
 * `source: 'web'` ride along so the native merged buffer keeps the web
 * entry's identity instead of restamping/retagging it (ADR-0047). Older app
 * builds simply ignore the extra fields.
 *
 * The entry `id` and its occurrence-time context travel too. In a hybrid run a
 * web entry is queued for upload AND relayed here, and the uploader later
 * drains this same native buffer — without a shared id the server would store
 * that one log as two documents. With it, the second copy upserts onto the
 * first.
 */
/**
 * Whether the batched charge has taken over (ADR-0063).
 *
 * Both paths deliver into the same native ring buffer and `ingestLogEntry` does
 * not dedup, so running them together double-files every `info`-and-above entry
 * — and leaves the per-entry bridge traffic that batching was meant to remove.
 *
 * It is switched on by the first charge that actually lands, not at boot. Until
 * then the installed app may be one that has no `SendLogBatch` handler at all,
 * and stopping early would leave its buffer with no web entries whatsoever.
 * The overlap that costs is bounded: entries dispatched before the first
 * successful charge are filed twice, and the ring buffer rotates them out.
 *
 * Module scope for the same reason as the other capability flags — there is one
 * installed app, so there is one answer.
 */
let batchRelayActive = false;

/** Called by the charge path once the app has accepted a batch. */
export const markBatchRelayActive = (): void => {
    batchRelayActive = true;
};

export const isBatchRelayActive = (): boolean => batchRelayActive;

/** Test seam — reverts to per-entry relaying. */
export const resetBatchRelay = (): void => {
    batchRelayActive = false;
};

export const createNativeForwarder = (): LogListener => {
    const adapter = new NativeBridgeAdapter();

    return entry => {
        // The charge carries everything now, including the levels this path
        // never could.
        if (batchRelayActive) return;

        // `debug` stays web-local. It is the highest-volume level — `withNetworkLog`
        // emits one per HTTP request — and relaying it costs more than it buys on
        // both ends:
        //
        // - It can never be uploaded from the native side: the upload queue drops
        //   `debug` on the way in, so `drainNative` destroys these entries the
        //   moment it polls them out of the native buffer.
        // - Until then it occupies a slot in the native ring buffer, whose eviction
        //   is oldest-first regardless of level. Web entries have a second copy in
        //   the web upload queue; native-origin entries (RN exceptions, FCM, Kotlin
        //   `NativeLogger`) do not, so evicting them is permanent loss.
        // - Every relayed entry is a bridge round trip on the UI thread, the same
        //   resource the cache path contends for.
        //
        // The cost of the gate is that web `debug` no longer reaches report
        // breadcrumbs in a hybrid run (the native merged buffer is the breadcrumb
        // source there). That is a small loss today because the destructive drain
        // already wipes those entries every flush; restoring them properly needs
        // the native side to separate its breadcrumb buffer from its upload queue.
        if (entry.level === 'debug') return;

        // Same mapping the batched charge uses (`toAppLogInfo`), so an entry
        // looks identical whichever path carried it across.
        const message: WebMessageData<'SendLog'> = {
            type: 'SendLog',
            data: { ...toAppLogInfo(entry), message: entry.message },
        };

        adapter.postMessage(message);
    };
};
