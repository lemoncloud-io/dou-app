import { create } from 'zustand';

import type { InvitePreview, InvitePreviewResult } from '../hooks/useInviteLogin';
import type { InviteLoginError } from '../utils/inviteError';

export type InviteStep = 'paste' | 'preview' | 'entering';

interface InviteLoginPageState {
    held: boolean;
    code: string;
    step: InviteStep;
    preview: InvitePreview | null;
    createdGuest: boolean;
    attempt: number;
    isSubmitting: boolean;
    error: InviteLoginError | null;
    done: boolean;
    setCode: (code: string) => void;
    start: () => number;
    resolvePreview: (attempt: number, result: InvitePreviewResult) => void;
    beginEnter: () => void;
    finish: (error: InviteLoginError | null) => void;
    backToPaste: () => void;
    release: () => void;
}

const initial = {
    held: false,
    code: '',
    step: 'paste' as InviteStep,
    preview: null,
    createdGuest: false,
    attempt: 0,
    isSubmitting: false,
    error: null,
    done: false,
};

export const useInviteLoginPageStore = create<InviteLoginPageState>((set, get) => ({
    ...initial,
    setCode: code => set({ code, error: null }),
    start: () => {
        const attempt = get().attempt + 1;
        set({ held: true, isSubmitting: true, error: null, attempt });
        return attempt;
    },
    resolvePreview: (attempt, result) => {
        if (attempt !== get().attempt) return;
        if ('error' in result) {
            set(s => ({
                isSubmitting: false,
                error: result.error,
                createdGuest: s.createdGuest || result.createdGuest,
            }));
            return;
        }
        set(s => ({
            step: 'preview',
            preview: result.preview,
            isSubmitting: false,
            createdGuest: s.createdGuest || result.preview.createdGuest,
        }));
    },
    beginEnter: () => set({ step: 'entering', isSubmitting: true, error: null }),
    finish: error => set(s => ({ isSubmitting: false, error, done: error === null, step: error ? 'preview' : s.step })),
    backToPaste: () =>
        set(s => ({ step: 'paste', preview: null, error: null, isSubmitting: false, attempt: s.attempt + 1 })),
    release: () => set(s => ({ ...initial, attempt: s.attempt + 1 })),
}));
