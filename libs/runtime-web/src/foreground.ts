import type { RuntimePorts } from '@chatic/runtime-core';

type ForegroundPorts = RuntimePorts['foreground'];

/** The part of a `Document` the foreground signal reads. */
export type VisibilitySource = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

const visibilityOf = (target: () => VisibilitySource | undefined): ForegroundPorts => ({
    read: () => {
        const doc = target();
        return doc === undefined ? true : doc.visibilityState === 'visible';
    },
    subscribe: listener => {
        const doc = target();
        if (doc === undefined) return () => undefined;
        doc.addEventListener('visibilitychange', listener);
        return () => doc.removeEventListener('visibilitychange', listener);
    },
});

/**
 * The page's visibility: in front of the user while `document.visibilityState` is `visible`, and a
 * change on every `visibilitychange`. Outside a page there is nothing to read, so it answers "in
 * front" and never changes — a retry that waits for a return that cannot be observed would wait
 * forever. `document` is looked up at each read, as a page's global.
 *
 * A phone shell's own return to the foreground is a bridge message, not this; an app that listens
 * for it calls the credential guards' `check` itself.
 */
const pageForeground = visibilityOf(() => (typeof document === 'undefined' ? undefined : document));

/**
 * The foreground signal for a web page (`foreground.visibility`): the page's own `document`, or the
 * `source` handed in — a test's stand-in, or another document the caller owns.
 */
export const webForegroundPorts = (source?: VisibilitySource): ForegroundPorts =>
    source === undefined ? pageForeground : visibilityOf(() => source);
