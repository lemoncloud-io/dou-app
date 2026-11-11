import type { MockState } from './state';

export interface StateStore {
    load(): MockState | null;
    save(state: MockState): void;
    clear(): void;
}

/** Holds the fake's state; handing it to a second fake stands for a reload. */
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
