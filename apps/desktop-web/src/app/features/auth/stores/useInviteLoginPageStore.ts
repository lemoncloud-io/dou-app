import { create } from 'zustand';

import type { InviteLoginError } from '../utils/inviteError';

interface InviteLoginPageState {
    /**
     * An attempt was submitted from the signed-out page and has not been left yet. The
     * invite exchange needs a guest session first, so the router flips to its signed-in
     * branch mid-attempt; while this is set that branch still routes `/auth/login`, so a
     * rejected code is shown on the page instead of dropping the person on Home.
     */
    held: boolean;
    code: string;
    isSubmitting: boolean;
    error: InviteLoginError | null;
    /** The exchange succeeded; the page leaves once the session reads as signed in. */
    done: boolean;
    setCode: (code: string) => void;
    start: () => void;
    finish: (error: InviteLoginError | null) => void;
    release: () => void;
}

const initial = { held: false, code: '', isSubmitting: false, error: null, done: false };

/**
 * State of the signed-out invite page, kept outside the component because the auth branch
 * flip can remount it while the attempt is still running.
 */
export const useInviteLoginPageStore = create<InviteLoginPageState>(set => ({
    ...initial,
    setCode: code => set({ code }),
    start: () => set({ held: true, isSubmitting: true, error: null }),
    finish: error => set({ isSubmitting: false, error, done: error === null }),
    release: () => set(initial),
}));
