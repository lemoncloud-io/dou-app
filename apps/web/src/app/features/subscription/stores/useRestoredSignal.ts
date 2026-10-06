import { create } from 'zustand';

import { isRestoreTransition, type SubscriptionState } from '../lib';

/**
 * Remembers, for this session only, whether the subscription came back while the app was watching.
 *
 * The relay keeps no "recently restored" flag, so the restored banner can only be shown when the app
 * saw the state go from an ending to running — typically after the user turned auto-renew back on in
 * the store and came back. Kept in memory on purpose: a restore seen yesterday, on another device or
 * before a reinstall is not news, and persisting it would turn a one-off note into a permanent one.
 */
interface RestoredSignalState {
    /** The last state any subscription screen observed. */
    lastState?: SubscriptionState;
    /** Set when a restore transition was observed; cleared once the note has been shown and left. */
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
