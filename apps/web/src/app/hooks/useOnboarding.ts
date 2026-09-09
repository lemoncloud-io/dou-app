import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

/**
 * `ui.onboardingCompleted` is the positive of the retired `usePreferenceStore.isFirstRun` — this
 * key's name already says what it holds, so nothing here needs to invert it (only the old
 * `chatic-onboarding-completed` storage key and the in-memory `isFirstRun` field disagreed).
 *
 * `persist: 'shell'`, so writes use the `shell` lane — `local` would land below a native-hydrated
 * shell value in `ConfigLanePolicy`'s row order and be silently shadowed.
 */
export const completeOnboarding = (): void => {
    config.set('ui.onboardingCompleted', true, { lane: 'shell' });
};

export const resetOnboarding = (): void => {
    config.set('ui.onboardingCompleted', false, { lane: 'shell' });
};

export const useOnboarding = () => {
    const onboardingCompleted = useConfigValue<boolean>('ui.onboardingCompleted') ?? false;
    return {
        isFirstRun: !onboardingCompleted,
        completeOnboarding,
        resetOnboarding,
    };
};
