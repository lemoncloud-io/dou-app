import { create } from 'zustand';

const ONBOARDING_COMPLETED_KEY = 'chatic-onboarding-completed';

const getInitialCompleted = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
};

interface OnboardingState {
    isCompleted: boolean;
}

interface OnboardingStore extends OnboardingState {
    completeOnboarding: () => void;
    resetOnboarding: () => void;
}

/**
 * Zustand store for managing onboarding state
 * Uses localStorage to persist completion status
 */
export const useOnboardingStore = create<OnboardingStore>()(set => ({
    isCompleted: getInitialCompleted(),

    /**
     * Mark onboarding as completed and persist to sessionStorage
     */
    completeOnboarding: () => {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        set({ isCompleted: true });
    },

    /**
     * Reset onboarding state for "replay" functionality
     */
    resetOnboarding: () => {
        localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
        set({ isCompleted: false });
    },
}));
