import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Images } from '@chatic/assets';

import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import type { OnboardingStep } from '../types';

export const useOnboardingSteps = (): OnboardingStep[] => {
    const { t, i18n } = useTranslation();

    return useMemo(() => {
        const isKorean = i18n.language === 'ko';

        return [
            {
                id: 'private-community',
                title: t('onboarding.steps.privateCommunity.title'),
                // Both numbers come from the creation limits themselves (consts.ts), not from copy:
                // this slide is a promise about what the app allows, and it said 5 and 5 long after
                // the limits moved — the pair ADR-0018 discarded as dead code.
                description: t('onboarding.steps.privateCommunity.description', {
                    maxPlaces: MAX_PLACES,
                    maxChannels: MAX_CHANNELS_PER_PLACE,
                }),
                image: isKorean ? Images.onboardingStep1 : Images.onboardingEnStep1,
            },
            {
                id: 'safe-space',
                title: t('onboarding.steps.safeSpace.title'),
                description: t('onboarding.steps.safeSpace.description'),
                image: isKorean ? Images.onboardingStep2 : Images.onboardingEnStep2,
            },
            {
                id: 'group-communication',
                title: t('onboarding.steps.groupCommunication.title'),
                // The 100 stays a literal on purpose: no constant owns a room's member capacity.
                // The only 100 in the client is `MAX_INVITE_SELECTION`, which caps how many people
                // one invite batch may SELECT — a different rule that would drift into a lie the
                // moment either number moved on its own.
                description: t('onboarding.steps.groupCommunication.description'),
                image: isKorean ? Images.onboardingStep3 : Images.onboardingEnStep3,
            },
            {
                id: 'memo-space',
                title: t('onboarding.steps.memoSpace.title'),
                description: t('onboarding.steps.memoSpace.description'),
                image: isKorean ? Images.onboardingStep4 : Images.onboardingEnStep4,
            },
        ];
    }, [i18n.language, t]);
};
