import { create } from 'zustand';

import type { InvitePreview, InvitePreviewResult } from '../hooks/useInviteLogin';
import type { InviteLoginError } from '../utils/inviteError';

/** Where the person is in the join: pasting the link, reading what it opens, or being let in. */
export type InviteStep = 'paste' | 'preview' | 'entering';

interface InviteLoginPageState {
    /**
     * An attempt was submitted from the signed-out page and has not been left yet. The
     * invite exchange needs a guest session first, so the router flips to its signed-in
     * branch mid-attempt; while this is set that branch still routes `/auth/login`, so a
     * rejected code is shown on the page instead of dropping the person on Home.
     */
    held: boolean;
    code: string;
    step: InviteStep;
    /** What the link opens, once the lookup has passed. */
    preview: InvitePreview | null;
    /**
     * A preview registered the device guest. Remembered across steps and failed attempts so that
     * leaving the page can sign it out — left alone, the signed-in router would take the person
     * into the app as a guest they never chose.
     */
    createdGuest: boolean;
    /** Bumped whenever a result in flight stops mattering, so a late answer can be recognised. */
    attempt: number;
    isSubmitting: boolean;
    error: InviteLoginError | null;
    /** The exchange succeeded; the page leaves once the session reads as signed in. */
    done: boolean;
    setCode: (code: string) => void;
    /** Begins a preview; returns the attempt number its result must be handed back with. */
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

/**
 * State of the signed-out invite page, kept outside the component because the auth branch
 * flip can remount it while the attempt is still running.
 */
export const useInviteLoginPageStore = create<InviteLoginPageState>((set, get) => ({
    ...initial,
    // A rejected code's alert is about the code that was sent; once the field is being
    // edited it describes nothing on screen, so it goes with the first keystroke.
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
    // The counter is kept, not zeroed: a lookup still in flight when the page is left must not
    // match the attempt number a later paste starts with.
    release: () => set(s => ({ ...initial, attempt: s.attempt + 1 })),
}));
