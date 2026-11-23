import { runtime } from '@chatic/runtime';

export const completeOnboarding = (): void => {
    runtime.settings.set('ui.onboardingCompleted', true, { lane: 'shell' });
};

export const resetOnboarding = (): void => {
    runtime.settings.set('ui.onboardingCompleted', false, { lane: 'shell' });
};

export const useOnboarding = () => {
    const onboardingCompleted = runtime.settings.useConfigValue<boolean>('ui.onboardingCompleted') ?? false;
    return {
        isFirstRun: !onboardingCompleted,
        completeOnboarding,
        resetOnboarding,
    };
};
