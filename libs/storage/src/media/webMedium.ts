import { globalStorage } from './globalStorage.util';
import { MemoryMedium } from './memoryMedium';

import type { KeyValueStore } from './types';

/**
 * A medium over one of the page's web storages.
 *
 * Every call goes to the storage itself rather than to a copy taken at construction. The web storage
 * is already synchronous, so a copy would buy nothing, and it would go stale the moment anything
 * else writes the same storage — another frame, a debug wipe, a test fixture — answering with a
 * value the storage no longer holds.
 */
export class WebMedium implements KeyValueStore {
    /** `webLocal` — this origin's `localStorage`. */
    static local(): KeyValueStore {
        return WebMedium.over(globalStorage('localStorage'));
    }

    /** `webSession` — this tab's `sessionStorage`. */
    static session(): KeyValueStore {
        return WebMedium.over(globalStorage('sessionStorage'));
    }

    /**
     * A medium over `storage`, or a memory medium when there is none (a worker, a test environment
     * without a DOM), so a caller never has to ask which one it was handed.
     */
    static over(storage: Storage | undefined): KeyValueStore {
        return storage ? new WebMedium(storage) : new MemoryMedium();
    }

    constructor(private readonly storage: Storage) {}

    get(key: string): string | null {
        return this.storage.getItem(key);
    }

    set(key: string, value: string): void {
        this.storage.setItem(key, value);
    }

    remove(key: string): void {
        this.storage.removeItem(key);
    }

    clear(): void {
        this.storage.clear();
    }

    keys(): string[] {
        const keys: string[] = [];
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key !== null) keys.push(key);
        }
        return keys;
    }
}
