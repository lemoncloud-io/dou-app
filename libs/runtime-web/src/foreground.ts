import type { RuntimePorts } from '@chatic/runtime-core';

type ForegroundPorts = RuntimePorts['foreground'];

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

const pageForeground = visibilityOf(() => (typeof document === 'undefined' ? undefined : document));

export const webForegroundPorts = (source?: VisibilitySource): ForegroundPorts =>
    source === undefined ? pageForeground : visibilityOf(() => source);
