import { buildAppLaunchUrl, isInAppBrowser, isInviteLink, shouldAutoLaunch } from './appLaunch';

const KAKAO_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5';
const SAFARI_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const CONFIG = { scheme: 'chatic', packageId: 'io.chatic.dou' };

describe('isInAppBrowser', () => {
    it.each([
        ['KakaoTalk', KAKAO_IOS],
        ['Naver', `${SAFARI_IOS} NAVER(inapp; search; 2000; 12.8.4)`],
        ['Instagram', `${SAFARI_IOS} Instagram 350.0.0.0`],
        ['Facebook', `${SAFARI_IOS} [FBAN/FBIOS;FBAV/480.0.0.0]`],
        ['Line', `${SAFARI_IOS} Line/14.16.0`],
    ])('recognises %s', (_name, userAgent) => {
        expect(isInAppBrowser(userAgent)).toBe(true);
    });

    it.each([
        ['Safari', SAFARI_IOS],
        ['Chrome on iOS', CHROME_IOS],
        ['Chrome on Android', CHROME_ANDROID],
    ])('does not treat %s as an in-app browser', (_name, userAgent) => {
        expect(isInAppBrowser(userAgent)).toBe(false);
    });
});

describe('shouldAutoLaunch', () => {
    it('always tries the app on Android, browser or not', () => {
        expect(shouldAutoLaunch('android', CHROME_ANDROID)).toBe(true);
    });

    it('tries the app on iOS inside an in-app browser', () => {
        expect(shouldAutoLaunch('ios', KAKAO_IOS)).toBe(true);
    });

    it('leaves Safari and Chrome on iOS to the button', () => {
        expect(shouldAutoLaunch('ios', SAFARI_IOS)).toBe(false);
        expect(shouldAutoLaunch('ios', CHROME_IOS)).toBe(false);
    });

    it('never tries on desktop', () => {
        expect(shouldAutoLaunch('desktop', KAKAO_IOS)).toBe(false);
    });
});

describe('buildAppLaunchUrl', () => {
    const fullPath = '/i?t=eyJjIjoiaW52dDoxOngifQ';

    it('uses the custom scheme on iOS and keeps the query', () => {
        expect(buildAppLaunchUrl('ios', fullPath, CONFIG, 'https://unused')).toBe(
            'chatic://i?t=eyJjIjoiaW52dDoxOngifQ'
        );
    });

    it('builds an intent URL on Android with the encoded fallback', () => {
        const fallback = 'https://app.chatic.io/i?t=abc#app-missing';

        expect(buildAppLaunchUrl('android', fullPath, CONFIG, fallback)).toBe(
            'intent://i?t=eyJjIjoiaW52dDoxOngifQ#Intent;scheme=chatic;package=io.chatic.dou' +
                `;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
        );
    });

    it('returns null on desktop', () => {
        expect(buildAppLaunchUrl('desktop', fullPath, CONFIG, 'https://unused')).toBeNull();
    });
});

describe('isInviteLink', () => {
    it.each([
        ['an encoded invite', 'https://app.chatic.io/i?t=eyJjIjoiaW52dDoxOngifQ'],
        ['a cloud invite', 'https://app.chatic.io/s?code=invt:1:x&api=abc&stage=dev'],
        ['a relay invite', 'https://app.chatic.io/s?code=invt:1:x&relay'],
    ])('accepts %s', (_name, url) => {
        expect(isInviteLink(url)).toBe(true);
    });

    it.each([
        ['a retired short link', 'https://app.chatic.io/s/1000052'],
        ['a bare /s', 'https://app.chatic.io/s'],
    ])('rejects %s, which the app could only show as invalid', (_name, url) => {
        expect(isInviteLink(url)).toBe(false);
    });
});
