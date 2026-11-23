import type { KeyValueStore } from './types';

export class SwitchableStore implements KeyValueStore {
    private current: KeyValueStore;

    constructor(private readonly initial: KeyValueStore) {
        this.current = initial;
    }

    use(store: KeyValueStore): void {
        this.current = store;
    }

    reset(): void {
        this.current = this.initial;
    }

    get(key: string): string | null {
        return this.current.get(key);
    }

    set(key: string, value: string): void {
        this.current.set(key, value);
    }

    remove(key: string): void {
        this.current.remove(key);
    }

    clear(): void {
        this.current.clear();
    }

    keys(): string[] {
        return this.current.keys();
    }
}
