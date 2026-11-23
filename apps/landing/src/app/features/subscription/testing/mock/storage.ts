import type { MockState } from './state';

export interface StateStore {
    load(): MockState | null;
    save(state: MockState): void;
    clear(): void;
}

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
