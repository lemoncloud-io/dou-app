import { create } from 'zustand';

// App-local onboarding store. Previously lived in `@chatic/web-core`, but that
// package dropped its app-specific stores; onboarding is a web-app concern, so it
// is reimplemented here. The localStorage key is kept identical so users who
// already completed onboarding are not shown it again after this migration.
const ONBOARDING_COMPLETED_KEY = 'chatic-onboarding-completed';

const getInitialCompleted = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
};

interface OnboardingStore {
    isCompleted: boolean;
    /** Mark onboarding as completed and persist it. */
    completeOnboarding: () => void;
    /** Clear completion so onboarding can be replayed. */
    resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(set => ({
    isCompleted: getInitialCompleted(),

    completeOnboarding: () => {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        set({ isCompleted: true });
    },

    resetOnboarding: () => {
        localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
        set({ isCompleted: false });
    },
}));
