import { useOnboardingStore } from './useOnboardingStore';
import { useAppPreferenceStore } from './useAppPreferenceStore';

describe('useOnboardingStore', () => {
    beforeEach(() => {
        localStorage.clear();
        useOnboardingStore.getState().resetOnboarding();
    });

    it('completeOnboarding sets the flag and persists to localStorage', () => {
        useOnboardingStore.getState().completeOnboarding();
        expect(useOnboardingStore.getState().isCompleted).toBe(true);
        expect(localStorage.getItem('chatic-onboarding-completed')).toBe('true');
    });

    it('resetOnboarding clears the flag and the persisted value', () => {
        useOnboardingStore.getState().completeOnboarding();
        useOnboardingStore.getState().resetOnboarding();
        expect(useOnboardingStore.getState().isCompleted).toBe(false);
        expect(localStorage.getItem('chatic-onboarding-completed')).toBeNull();
    });
});

describe('useAppPreferenceStore', () => {
    beforeEach(() => {
        localStorage.clear();
        useAppPreferenceStore.getState().setBlurLastMessage(false);
    });

    it('setBlurLastMessage persists the preference', () => {
        useAppPreferenceStore.getState().setBlurLastMessage(true);
        expect(useAppPreferenceStore.getState().blurLastMessage).toBe(true);
        expect(localStorage.getItem('chatic-blur-last-message')).toBe('true');

        useAppPreferenceStore.getState().setBlurLastMessage(false);
        expect(localStorage.getItem('chatic-blur-last-message')).toBe('false');
    });
});
