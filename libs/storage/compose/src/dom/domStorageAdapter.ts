import type { KeyValueStore } from '../types';

export class DomStorageAdapter implements Storage {
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
