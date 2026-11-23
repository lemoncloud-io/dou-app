import { create } from 'zustand';

import type { PushDeeplinkTarget } from '../utils/parsePushDeeplink';

export type PendingOpenTarget = PushDeeplinkTarget & {
    nonce: number;
};

interface PendingOpenState {
    target: PendingOpenTarget | null;
    request: (target: PushDeeplinkTarget) => void;
    clear: () => void;
}

let seq = 0;

export const usePendingOpenStore = create<PendingOpenState>(set => ({
    target: null,
    request: target => set({ target: { ...target, nonce: ++seq } }),
    clear: () => set({ target: null }),
}));
