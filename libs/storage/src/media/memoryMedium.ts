import type { KeyValueStore } from './types';

/** A medium that lives as long as the page: nothing survives a reload. */
export class MemoryMedium implements KeyValueStore {
    private readonly values = new Map<string, string>();

    get(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    set(key: string, value: string): void {
        this.values.set(key, value);
    }

    remove(key: string): void {
        this.values.delete(key);
    }

    clear(): void {
        this.values.clear();
    }

    keys(): string[] {
        return [...this.values.keys()];
    }
}
