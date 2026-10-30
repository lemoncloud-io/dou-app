import { storage } from '@chatic/shared';

import type { StorageLike } from '@chatic/session';

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

/**
 * The stored list of paired clouds. A plain store with nothing but its storage behind it, so
 * `isPairedSession`, the relay logout and the hooks can read and clear it without pulling the socket
 * runtime in — the lifecycle that acts on it is `PairedCloudSessions`.
 */
export class PairedCloudStore {
    private readonly listeners = new Set<Listener>();

    constructor(
        private readonly storage: StorageLike,
        private readonly key: string = PAIRED_CLOUDS_KEY
    ) {}

    list(): string[] {
        return this.read();
    }

    has(cloudId: string): boolean {
        return this.read().includes(cloudId);
    }

    add(cloudId: string): void {
        const ids = this.read();
        if (!ids.includes(cloudId)) this.write([...ids, cloudId]);
    }

    remove(cloudId: string): void {
        const ids = this.read();
        if (ids.includes(cloudId)) this.write(ids.filter(id => id !== cloudId));
    }

    clear(): void {
        if (this.read().length) this.write([]);
    }

    /**
     * Hears every change to the list; returns the unsubscribe. A bound field rather than a method:
     * `useSyncExternalStore(pairedClouds.subscribe, …)` hands it over detached from the store.
     */
    readonly subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private read(): string[] {
        try {
            const parsed: unknown = JSON.parse(this.storage.get(this.key) ?? '[]');
            return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && !!id) : [];
        } catch {
            return [];
        }
    }

    private write(ids: string[]): void {
        if (ids.length) this.storage.set(this.key, JSON.stringify(ids));
        else this.storage.remove(this.key);
        this.listeners.forEach(listener => listener(ids));
    }
}

export const pairedClouds = new PairedCloudStore(storage);
