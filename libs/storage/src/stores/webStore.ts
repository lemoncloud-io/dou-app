import { globalStorage } from './globalStorage.util';
import { MemoryStore } from './memoryStore';

import type { KeyValueStore } from './types';

export class WebStore implements KeyValueStore {
    static local(): KeyValueStore {
        return WebStore.over(globalStorage('localStorage'));
    }

    static session(): KeyValueStore {
        return WebStore.over(globalStorage('sessionStorage'));
    }

    static over(storage: Storage | undefined): KeyValueStore {
        return storage ? new WebStore(storage) : new MemoryStore();
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
