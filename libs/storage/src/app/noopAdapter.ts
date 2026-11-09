import type { StorageAdapter } from './types';

/** Where there is no web storage at all: keeps nothing, so every read answers null. */
export class NoopAdapter implements StorageAdapter {
    getItem(): string | null {
        return null;
    }

    setItem(): void {
        // Nowhere to keep it.
    }

    removeItem(): void {
        // Nothing was kept.
    }
}
