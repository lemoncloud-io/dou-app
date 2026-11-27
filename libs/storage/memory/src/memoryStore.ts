import type { KeyValueStore } from '@chatic/storage-compose';

export class MemoryStore implements KeyValueStore {
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

export const memoryStore = (): KeyValueStore => new MemoryStore();

export type MemoryStoragePorts = Record<'secret' | 'plain' | 'device' | 'tab', KeyValueStore>;

export const memoryStoragePorts = (): MemoryStoragePorts => ({
    secret: memoryStore(),
    plain: memoryStore(),
    device: memoryStore(),
    tab: memoryStore(),
});
