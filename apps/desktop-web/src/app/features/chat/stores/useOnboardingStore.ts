import { create } from 'zustand';
import { deviceStore } from '../../../storage';

const onboardedKey = (userId: string) => `chatic.desktop.onboarded:${userId}`;

export const hasSeenOnboarding = (userId: string): boolean => {
    return deviceStore.get(onboardedKey(userId)) === '1';
};

export const markOnboardingSeen = (userId: string): void => {
    deviceStore.set(onboardedKey(userId), '1');
};

interface OnboardingState {
    checkedFor: string | null;
    markChecked: (userId: string) => void;
    reopenRequested: boolean;
    reopen: () => void;
    consumeReopen: () => void;
}

export const useOnboardingStore = create<OnboardingState>(set => ({
    checkedFor: null,
    markChecked: userId => set({ checkedFor: userId }),
    reopenRequested: false,
    reopen: () => set({ reopenRequested: true }),
    consumeReopen: () => set({ reopenRequested: false }),
}));
