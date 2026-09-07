import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Images } from '@chatic/assets';

import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import type { OnboardingStep } from '../types';

export const useOnboardingSteps = (): OnboardingStep[] => {
    const { i18n } = useTranslation();

    return useMemo(() => {
        const isKorean = i18n.language === 'ko';

        return [
            {
                id: 'private-community',
                title: isKorean ? '프라이빗 커뮤니티' : 'Private Community',
                // Both numbers come from the creation limits themselves (consts.ts), not from copy:
                // this slide is a promise about what the app allows, and it said 5 and 5 long after
                // the limits moved — the pair ADR-0018 discarded as 죽은 코드.
                description: isKorean
                    ? `최대 ${MAX_PLACES}개의 대화공간과, ${MAX_CHANNELS_PER_PLACE}개의 채팅방으로\n필요한 사람들과 필요한 이야기를 나눠요`
                    : `Create up to ${MAX_PLACES} spaces and ${MAX_CHANNELS_PER_PLACE} chat rooms\nto talk with the people you need`,
                image: isKorean ? Images.onboardingStep1 : Images.onboardingEnStep1,
            },
            {
                id: 'safe-space',
                title: isKorean ? '안전한 대화 공간' : 'Safe Chat Space',
                description: isKorean
                    ? '초대 링크를 받은 친구끼리\n안전하게 대화가 가능해요.'
                    : 'Chat safely with friends\nwho received the invite link.',
                image: isKorean ? Images.onboardingStep2 : Images.onboardingEnStep2,
            },
            {
                id: 'group-communication',
                title: isKorean ? '그룹 소통' : 'Group Communication',
                // The 100 stays a literal on purpose: no constant owns a room's member capacity.
                // The only 100 in the client is `MAX_INVITE_SELECTION`, which caps how many people
                // one invite batch may SELECT — a different rule that would drift into a lie the
                // moment either number moved on its own.
                description: isKorean
                    ? '최대 100명의 적정 규모로 더 집중된\n대화와 활발한 참여가 가능해요.'
                    : 'With up to 100 members, enjoy more focused\nconversations and active participation.',
                image: isKorean ? Images.onboardingStep3 : Images.onboardingEnStep3,
            },
            {
                id: 'memo-space',
                title: isKorean ? '나에게 보내는 메모 공간' : 'Personal Memo Space',
                description: isKorean
                    ? '할 일 정리, 빠른 기록까지\n나만 보는 개인 메모 공간을 활용해요.'
                    : 'Organize tasks and quick notes\nin your private memo space.',
                image: isKorean ? Images.onboardingStep4 : Images.onboardingEnStep4,
            },
        ];
    }, [i18n.language]);
};
