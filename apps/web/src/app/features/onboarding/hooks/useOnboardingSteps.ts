import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Images } from '@chatic/assets';

import type { OnboardingStep } from '../consts';

export const useOnboardingSteps = (): OnboardingStep[] => {
    const { i18n } = useTranslation();

    return useMemo(() => {
        const isKorean = i18n.language === 'ko';

        return [
            {
                id: 'personal-community',
                title: isKorean ? '퍼스널 커뮤니티' : 'Personal Community',
                description: isKorean
                    ? '최대 5개의 대화공간과, 5개의 채팅방으로\n필요한 사람들과 필요한 이야기를 나눠요'
                    : 'Create up to 5 spaces and 5 chat rooms\nto talk with the people you need',
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
