import { logHub } from '@chatic/logger';

import { isNative } from '../common';
import { createNativeForwarder } from './nativeForwarder';

/** What the caller gets back: a way to detach what this call attached. */
export interface BridgeLoggerHandle {
    /** Detaches every sink this call attached (used by tests and teardown). */
    teardown(): void;
}

let handle: BridgeLoggerHandle | undefined;

/**
 * Attaches the native relay to the shared log hub, in a hybrid run only.
 *
 * This used to attach the console too — web console on plain web, and optionally
 * inside the WebView as well. That made a decision about console output a side
 * effect of a function about bridging, and it put a web sink in a bridge
 * package. The console listener now belongs to `apps/web`
 * (`attachConsoleListener`), which is what decides which of its listeners run.
 *
 * There is no console fallback behind this any more either: a host that never
 * calls this and never subscribes anything simply produces no output, which is
 * the honest result (principle 16).
 *
 * Idempotent — repeated calls return the existing handle.
 */
export const setupBridgeLogger = (): BridgeLoggerHandle => {
    if (handle) return handle;

    const unsubscribes: Array<() => void> = [];

    if (isNative()) {
        // Subscribed plainly. This used to be a gated subscription that could be
        // told to go quiet once the batched charge took over — two web→app paths
        // existed and one had to stand down, and unsubscribing was not an option
        // because the core turned its console fallback back on when the hub
        // emptied. Both of those are gone: there is one path, and no fallback.
        unsubscribes.push(logHub.subscribe(createNativeForwarder()));
    }

    handle = {
        teardown() {
            unsubscribes.forEach(unsubscribe => unsubscribe());
            handle = undefined;
        },
    };

    return handle;
};
