/**
 * `store/store.ts`
 */

export interface Store<T> {
    upsert(key: string, value: T): void;
    read(key: string): T | undefined;
    readAll(): ReadonlyMap<string, T>;
    /** Change notification (key-agnostic). Returns a function that unsubscribes. */
    subscribe(listener: () => void): () => void;
    /** For `useSyncExternalStore`'s `getSnapshot` identity check — increments on change */
    version(): number;
    remove(key: string): void;
    clear(): void;
}

export interface StoreBacking<T> {
    write(key: string, value: T): Promise<void>;
    remove?(key: string): Promise<void>;
}

export const createMemoryStore = <T>(backing?: StoreBacking<T>): Store<T> => {
    const map = new Map<string, T>();
    const listeners = new Set<() => void>();
    let ver = 0;

    const bump = () => {
        ver += 1;
        listeners.forEach(fn => fn());
    };

    return {
        upsert(key, value) {
            map.set(key, value);
            bump();
            // Write-through to the cache DB — fire-and-forget (no need to await, since UI reads treat the mirror as the source of truth)
            backing?.write(key, value).catch(() => void 0);
        },
        read(key) {
            return map.get(key);
        },
        readAll() {
            return map;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        version() {
            return ver;
        },
        remove(key) {
            if (!map.delete(key)) return;
            bump();
            backing?.remove?.(key).catch(() => void 0);
        },
        clear() {
            if (!map.size) return;
            map.clear();
            bump();
        },
    };
};
