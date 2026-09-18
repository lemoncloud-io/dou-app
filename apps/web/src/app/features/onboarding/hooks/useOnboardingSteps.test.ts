import { renderHook } from '@testing-library/react';

import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import { useOnboardingSteps } from './useOnboardingSteps';

let language = 'ko';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language } }) }));
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
