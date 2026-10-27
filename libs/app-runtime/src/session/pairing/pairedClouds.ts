import { storage } from '@chatic/shared';

/**
 * The clouds this guest session entered through a pairing — kept under the same storage as the
 * session itself (per tab in a browser, the device's `localStorage` inside a shell), so it lives and
 * dies with the session it belongs to.
 *
 * A guest's own cloud catalog (`clouds?view=mine`) is empty, so without this list a cloud approved for
 * this browser would never show in the cloud switch sheet. It is also what the periodic re-check walks
 * (a paired cloud is renewed by delegation only, so that a revoked approval ends it within minutes),
 * and a guest holding one counts as a secondary device.
 */
const PAIRED_CLOUDS_KEY = 'chatic-paired-cloud-ids';

type Listener = (ids: readonly string[]) => void;
const listeners = new Set<Listener>();

const read = (): string[] => {
    try {
        const parsed: unknown = JSON.parse(storage.get(PAIRED_CLOUDS_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && !!id) : [];
    } catch {
        return [];
    }
};

const write = (ids: string[]): void => {
    if (ids.length) storage.set(PAIRED_CLOUDS_KEY, JSON.stringify(ids));
    else storage.remove(PAIRED_CLOUDS_KEY);
    listeners.forEach(listener => listener(ids));
};

export const pairedClouds = {
    list: (): string[] => read(),
    has: (cloudId: string): boolean => read().includes(cloudId),
    add(cloudId: string): void {
        const ids = read();
        if (!ids.includes(cloudId)) write([...ids, cloudId]);
    },
    remove(cloudId: string): void {
        const ids = read();
        if (ids.includes(cloudId)) write(ids.filter(id => id !== cloudId));
    },
    clear(): void {
        if (read().length) write([]);
    },
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
