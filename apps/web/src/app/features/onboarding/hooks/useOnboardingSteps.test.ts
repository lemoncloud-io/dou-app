import { renderHook } from '@testing-library/react';

import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import { useOnboardingSteps } from './useOnboardingSteps';

let language = 'ko';

// Mirrors the `onboarding.steps.*` keys in apps/web/public/locales/{ko,en}/translation.json,
// just enough for this hook's own interpolation (`{{maxPlaces}}`, `{{maxChannels}}`) to resolve.
const stepText: Record<string, Record<string, string>> = {
    ko: {
        'onboarding.steps.privateCommunity.title': '프라이빗 커뮤니티',
        'onboarding.steps.privateCommunity.description':
            '최대 {{maxPlaces}}개의 대화공간과, {{maxChannels}}개의 채팅방으로\n필요한 사람들과 필요한 이야기를 나눠요',
        'onboarding.steps.safeSpace.title': '안전한 대화 공간',
        'onboarding.steps.safeSpace.description': '초대 링크를 받은 친구끼리\n안전하게 대화가 가능해요.',
        'onboarding.steps.groupCommunication.title': '그룹 소통',
        'onboarding.steps.groupCommunication.description':
            '최대 100명의 적정 규모로 더 집중된\n대화와 활발한 참여가 가능해요.',
        'onboarding.steps.memoSpace.title': '나에게 보내는 메모 공간',
        'onboarding.steps.memoSpace.description': '할 일 정리, 빠른 기록까지\n나만 보는 개인 메모 공간을 활용해요.',
    },
    en: {
        'onboarding.steps.privateCommunity.title': 'Private Community',
        'onboarding.steps.privateCommunity.description':
            'Create up to {{maxPlaces}} spaces and {{maxChannels}} chat rooms\nto talk with the people you need',
        'onboarding.steps.safeSpace.title': 'Safe Chat Space',
        'onboarding.steps.safeSpace.description': 'Chat safely with friends\nwho received the invite link.',
        'onboarding.steps.groupCommunication.title': 'Group Communication',
        'onboarding.steps.groupCommunication.description':
            'With up to 100 members, enjoy more focused\nconversations and active participation.',
        'onboarding.steps.memoSpace.title': 'Personal Memo Space',
        'onboarding.steps.memoSpace.description': 'Organize tasks and quick notes\nin your private memo space.',
    },
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const template = stepText[language]?.[key] ?? key;
            if (!options) return template;
            return Object.entries(options).reduce(
                (text, [name, value]) => text.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
                template
            );
        },
        i18n: { language },
    }),
}));
jest.mock('@chatic/assets', () => ({ Images: new Proxy({}, { get: (_t, key) => `image:${String(key)}` }) }));

const stepsFor = (locale: string) => {
    language = locale;
    return renderHook(() => useOnboardingSteps()).result.current;
};

const slide = (locale: string, id: string) => stepsFor(locale).find(step => step.id === id);

/**
 * This slide is a promise about "what the app allows", so it has to move together with the limits.
 * It used to have 5 and 5 hardcoded as strings, and they stayed that way even after ADR-0018 retired
 * that value.
 */
describe('useOnboardingSteps — 생성 한도 문구', () => {
    it.each(['ko', 'en'])('%s 문구가 상수에서 온 숫자를 싣는다', locale => {
        const description = slide(locale, 'private-community')?.description ?? '';

        expect(description).toContain(String(MAX_PLACES));
        expect(description).toContain(String(MAX_CHANNELS_PER_PLACE));
    });

    it('폐기된 한도(5/5)를 다시 박아 넣지 않는다', () => {
        // If the constant happens to become 5 again, this assertion loses its meaning — check the product spec, not this test, when that happens.
        if (MAX_PLACES === 5) return;
        for (const locale of ['ko', 'en']) {
            expect(slide(locale, 'private-community')?.description).not.toMatch(/\b5\b/);
        }
    });

    it('언어별로 다른 문구와 이미지를 고른다', () => {
        expect(slide('ko', 'private-community')?.title).toBe('프라이빗 커뮤니티');
        expect(slide('en', 'private-community')?.title).toBe('Private Community');
        expect(slide('ko', 'private-community')?.image).not.toBe(slide('en', 'private-community')?.image);
    });

    it('네 장을 모두 돌려준다 — 모달의 단계 수가 이 길이다', () => {
        expect(stepsFor('ko').map(step => step.id)).toEqual([
            'private-community',
            'safe-space',
            'group-communication',
            'memo-space',
        ]);
    });
});
