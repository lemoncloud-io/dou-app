import { createConsoleListener, logHub } from '@chatic/logger';

import { isNative } from '../common';
import { createNativeForwarder } from './nativeForwarder';

export interface SetupBridgeLoggerOptions {
    /**
     * Mirror log entries to the web console even inside the native WebView.
     * Intended for dev builds where the WebView inspector is attached.
     */
    consoleInNative?: boolean;
}

let teardown: (() => void) | undefined;

/**
 * Wires environment-appropriate log sinks to the shared log hub:
 * - native WebView: forward to the app (plus console when `consoleInNative`)
 * - plain web: console output
 *
 * Apps that never call this keep the logger's built-in console fallback, so
 * wiring is only required where native forwarding matters (apps/web).
 * Idempotent — repeated calls return the existing teardown. The returned
 * teardown detaches every sink this call attached (used by tests).
 */
export const setupBridgeLogger = (options: SetupBridgeLoggerOptions = {}): (() => void) => {
    if (teardown) return teardown;

    const unsubscribes: Array<() => void> = [];

    if (isNative()) {
        unsubscribes.push(logHub.subscribe(createNativeForwarder()));

        if (options.consoleInNative) {
            unsubscribes.push(logHub.subscribe(createConsoleListener()));
        }
    } else {
        unsubscribes.push(logHub.subscribe(createConsoleListener()));
    }

    teardown = () => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        teardown = undefined;
    };

    return teardown;
};
