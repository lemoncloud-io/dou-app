import type { KeyValueStore } from './types';

/**
 * A medium that forwards every call to whichever medium it currently points at.
 *
 * For state that is wired at import time but whose medium the entry point decides later: a zustand
 * `persist` store and an i18n module take their storage when they are created, before `main.tsx` has
 * built the app's media. Handing them a switchable medium lets the entry point point it at the real one
 * afterwards, and every later call lands there. It starts on `initial`, which should be the same storage
 * the entry point is expected to choose, so nothing written before the switch is stranded.
 */
export class SwitchableMedium implements KeyValueStore {
    private current: KeyValueStore;

    constructor(private readonly initial: KeyValueStore) {
        this.current = initial;
    }

    /** Points every later call at `medium`. */
    use(medium: KeyValueStore): void {
        this.current = medium;
    }

    /** Back to the medium it was created with. For tests. */
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
