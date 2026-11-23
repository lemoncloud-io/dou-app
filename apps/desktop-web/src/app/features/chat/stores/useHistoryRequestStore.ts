import { create } from 'zustand';

export type HistoryDirection = 'back' | 'forward';

interface HistoryRequestState {
    nonce: number;
    direction: HistoryDirection;
    press: (direction: HistoryDirection) => void;
}

export const useHistoryRequestStore = create<HistoryRequestState>(set => ({
    nonce: 0,
    direction: 'back',
    press: direction => set(s => ({ nonce: s.nonce + 1, direction })),
}));
