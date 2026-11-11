import type { RuntimePorts } from '@chatic/runtime-core';

type ForegroundPorts = RuntimePorts['foreground'];

/**
 * The page's visibility: in front of the user while `document.visibilityState` is `visible`, and a
 * change on every `visibilitychange`. Outside a page there is nothing to read, so it answers "in
 * front" and never changes — a retry that waits for a return that cannot be observed would wait
 * forever.
 *
 * A phone shell's own return to the foreground is a bridge message, not this; an app that listens
 * for it calls the credential guards' `check` itself.
 */
const foreground: ForegroundPorts = {
    read: () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
    subscribe: listener => {
        if (typeof document === 'undefined') return () => undefined;
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
    },
};

/** The foreground signal for a web page. */
export const webForegroundPorts = (): ForegroundPorts => foreground;
