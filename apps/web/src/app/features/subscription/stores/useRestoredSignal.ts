import { create } from 'zustand';

import { isRestoreTransition, type SubscriptionState } from '../lib';

interface RestoredSignalState {
    lastState?: SubscriptionState;
    restored: boolean;
    observe: (state: SubscriptionState) => void;
    dismiss: () => void;
}

export const useRestoredSignal = create<RestoredSignalState>(set => ({
    lastState: undefined,
    restored: false,
    observe: state =>
        set(prev => {
            if (prev.lastState === state) return prev;
            return { lastState: state, restored: prev.restored || isRestoreTransition(prev.lastState, state) };
        }),
    dismiss: () => set({ restored: false }),
}));
