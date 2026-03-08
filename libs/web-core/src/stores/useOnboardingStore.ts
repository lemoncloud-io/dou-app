import { create } from 'zustand';

const ONBOARDING_COMPLETED_KEY = 'chatic-onboarding-completed';

interface OnboardingState {
    isCompleted: boolean;
}

interface OnboardingStore extends OnboardingState {
    initializeOnboardingState: () => void;
    completeOnboarding: () => void;
    resetOnboarding: () => void;
}

const initialState: OnboardingState = {
    isCompleted: false,
};

/**
 * Zustand store for managing onboarding state
 * Uses sessionStorage to persist completion status
 */
export const useOnboardingStore = create<OnboardingStore>()(set => ({
    ...initialState,

    /**
     * Initialize onboarding state from sessionStorage
     */
    initializeOnboardingState: () => {
        const completed = sessionStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
        set({ isCompleted: completed });
    },

    /**
     * Mark onboarding as completed and persist to sessionStorage
     */
    completeOnboarding: () => {
        sessionStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        set({ isCompleted: true });
    },

    /**
     * Reset onboarding state for "replay" functionality
     */
    resetOnboarding: () => {
        sessionStorage.removeItem(ONBOARDING_COMPLETED_KEY);
        set({ isCompleted: false });
    },
}));
