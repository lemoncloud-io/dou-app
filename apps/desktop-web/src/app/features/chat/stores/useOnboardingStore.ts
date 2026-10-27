import { create } from 'zustand';

import { safeLocalStorage } from '@chatic/shared';

/**
 * Seen-flag key, one per account. A single device-wide flag survived logout, so
 * the next person to sign in on the same machine never saw the tips.
 */
const onboardedKey = (userId: string) => `chatic.desktop.onboarded:${userId}`;

/**
 * The seen flag lives in localStorage, not in the store below: the renderer
 * reloads itself to recover a socket wedged after sleep, and an in-memory flag
 * let every such reload reopen tips the person had already closed. Storage
 * access is guarded because it throws outright in a locked-down profile — there
 * the tips reappear, which is the harmless end of the trade.
 */
export const hasSeenOnboarding = (userId: string): boolean => safeLocalStorage.getItem(onboardedKey(userId)) === '1';

/** A dropped write is harmless: the in-session flag below still keeps it closed until reload. */
export const markOnboardingSeen = (userId: string): void => {
    safeLocalStorage.setItem(onboardedKey(userId), '1');
};

interface OnboardingState {
    /**
     * The account whose first-run check already ran this session. The dialog
     * lives on the home screen, which remounts on every return from Profile or
     * Settings; a per-mount flag reopened tips the person had just closed.
     */
    checkedFor: string | null;
    markChecked: (userId: string) => void;
    /** Settings asked to show the tips again; the dialog consumes it once. */
    reopenRequested: boolean;
    reopen: () => void;
    consumeReopen: () => void;
}

/**
 * The onboarding tips used to be one-shot and unrecoverable: once dismissed —
 * including by an accidental Escape — nothing could bring them back. Settings
 * reopens them through this.
 */
export const useOnboardingStore = create<OnboardingState>(set => ({
    checkedFor: null,
    markChecked: userId => set({ checkedFor: userId }),
    reopenRequested: false,
    reopen: () => set({ reopenRequested: true }),
    consumeReopen: () => set({ reopenRequested: false }),
}));
