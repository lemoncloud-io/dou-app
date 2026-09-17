import { create } from 'zustand';

/**
 * Seen-flag key, one per account. A single device-wide flag survived logout, so
 * the next person to sign in on the same machine never saw the tips.
 */
export const onboardedKey = (userId: string) => `chatic.desktop.onboarded:${userId}`;

interface OnboardingState {
    /** Bumped to reopen the tips on demand, after they were finished once. */
    reopenNonce: number;
    reopen: () => void;
}

/**
 * The onboarding tips used to be one-shot and unrecoverable: once dismissed —
 * including by an accidental Escape — nothing could bring them back. Settings
 * reopens them through this.
 */
export const useOnboardingStore = create<OnboardingState>(set => ({
    reopenNonce: 0,
    reopen: () => set(state => ({ reopenNonce: state.reopenNonce + 1 })),
}));
