import type { KeyValueStore } from '../media/types';

/**
 * A medium seen as a DOM `Storage`, for code that only takes that shape — the config lib's storage
 * ports, zustand's `persist`, the i18n translation cache and the landing site's sign-in hand-off.
 *
 * `key(index)` and `length` read a fresh key list each time, so they stay consistent with writes made
 * between two calls, which is what a caller walking the keys with an index relies on.
 */
export class DomStorageAdapter implements Storage {
    // `Storage` declares an index signature for named-property access; nothing here uses it.
    [name: string]: unknown;

    constructor(private readonly store: KeyValueStore) {}

    get length(): number {
        return this.store.keys().length;
    }

    key(index: number): string | null {
        return this.store.keys()[index] ?? null;
    }

    getItem(key: string): string | null {
        return this.store.get(key);
    }

    // The DOM contract stores strings; a caller handing a number gets what `localStorage` gives it.
    setItem(key: string, value: string): void {
        this.store.set(key, String(value));
    }

    removeItem(key: string): void {
        this.store.remove(key);
    }

    clear(): void {
        this.store.clear();
    }
}
