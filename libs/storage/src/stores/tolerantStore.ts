import type { KeyValueStore } from './types';

/**
 * A store whose failures cost the value, never the caller.
 *
 * Web storage throws on a full quota, in a few private-window configurations and when a browser blocks
 * it outright. For the session that is a real error and `WebStore` lets it through. For the state an
 * app keeps for convenience — a composer draft, the recent emoji, a log batch — the screen that writes
 * it must keep working when the write is lost, so this wrapper turns a failed read into "absent" and a
 * failed write into a no-op.
 */
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
