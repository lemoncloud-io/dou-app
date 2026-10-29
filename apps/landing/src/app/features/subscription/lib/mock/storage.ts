import type { MockState } from './state';

export interface StateStore {
    load(): MockState | null;
    save(state: MockState): void;
    clear(): void;
}

const KEY = '@landing.subscription.mock';

/**
 * Where the mock keeps its state between page loads: `sessionStorage`, so a reload in the middle of a
 * flow keeps a cancelled subscription cancelled while a new tab starts clean. Any storage failure —
 * a private window, a quota, a blocked origin — falls back to memory for the rest of the page's life
 * rather than breaking the screens.
 */
export const sessionStateStore = (storage: () => Storage = () => window.sessionStorage): StateStore => {
    let memory: MockState | null = null;
    return {
        load() {
            try {
                const raw = storage().getItem(KEY);
                if (raw) return JSON.parse(raw) as MockState;
            } catch {
                // Unreadable or unparsable — fall through to memory.
            }
            return memory;
        },
        save(state) {
            memory = state;
            try {
                storage().setItem(KEY, JSON.stringify(state));
            } catch {
                // Memory already holds it.
            }
        },
        clear() {
            memory = null;
            try {
                storage().removeItem(KEY);
            } catch {
                // Nothing stored to clear.
            }
        },
    };
};

export const memoryStateStore = (): StateStore => {
    let memory: MockState | null = null;
    return {
        load: () => memory,
        save: state => {
            memory = state;
        },
        clear: () => {
            memory = null;
        },
    };
};
