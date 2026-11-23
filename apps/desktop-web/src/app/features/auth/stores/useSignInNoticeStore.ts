import { create } from 'zustand';

import { takeSignInNotice, type SignInNoticeRecord } from '../utils/signInNotice';

interface SignInNoticeState {
    notice: SignInNoticeRecord | null;
    pick: () => void;
    take: () => SignInNoticeRecord | null;
    clear: () => void;
}

export const useSignInNoticeStore = create<SignInNoticeState>((set, get) => ({
    notice: takeSignInNotice(),
    pick: () => {
        const taken = takeSignInNotice();
        if (taken) set({ notice: taken });
    },
    take: () => {
        const { notice } = get();
        if (notice) set({ notice: null });
        return notice;
    },
    clear: () => set({ notice: null }),
}));

export const selectNewAccountPending = (s: SignInNoticeState): boolean => s.notice?.isNew === true;
