import type { KeyValueStore } from './types';

export class TolerantStore implements KeyValueStore {
    constructor(private readonly inner: KeyValueStore) {}

    get(key: string): string | null {
        try {
            return this.inner.get(key);
        } catch {
            return null;
        }
    }

    set(key: string, value: string): void {
        try {
            this.inner.set(key, value);
        } catch {
            // Full or blocked: the caller's in-memory state is all this run keeps.
        }
    }

    remove(key: string): void {
        try {
            this.inner.remove(key);
        } catch {
            // Nothing was readable there either.
        }
    }

    clear(): void {
        try {
            this.inner.clear();
        } catch {
            // Same as `remove`.
        }
    }

    keys(): string[] {
        try {
            return this.inner.keys();
        } catch {
            return [];
        }
    }
}
