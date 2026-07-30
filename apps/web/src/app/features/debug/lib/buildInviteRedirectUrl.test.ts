import { buildInviteRedirectUrl, DEFAULT_INVITE_REDIRECT_BASE } from './buildInviteRedirectUrl';

const SHARE_LINK =
    'https://app-dev.chatic.io/s?code=invt%3A910432%3A6f9a03e5-5e28-424e-bc1f-1ebdb34631eb&api=uzjpiaey7a&stage=dev';

describe('buildInviteRedirectUrl', () => {
    it('converts a share link into the invite redirect URL (matches the documented example)', () => {
        expect(buildInviteRedirectUrl(SHARE_LINK)).toBe(
            'https://dou-dev.chatic.io/?code=invt%3A910432%3A6f9a03e5-5e28-424e-bc1f-1ebdb34631eb' +
                '&provider=invite&version=2' +
                '&_backend=https%3A%2F%2Fuzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com%2Fdev'
        );
    });

    it('composes _backend from the source api id and stage', () => {
        const url = new URL(buildInviteRedirectUrl(SHARE_LINK));
        expect(url.searchParams.get('_backend')).toBe(
            'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev'
        );
        expect(url.searchParams.get('provider')).toBe('invite');
        expect(url.searchParams.get('version')).toBe('2');
        expect(url.searchParams.get('code')).toBe('invt:910432:6f9a03e5-5e28-424e-bc1f-1ebdb34631eb');
    });

    it('uses the editable base and normalizes a trailing slash to a single `/?`', () => {
        expect(buildInviteRedirectUrl(SHARE_LINK, 'https://app.chatic.io/')).toMatch(
            /^https:\/\/app\.chatic\.io\/\?code=/
        );
        expect(buildInviteRedirectUrl(SHARE_LINK, 'https://app.chatic.io')).toMatch(
            /^https:\/\/app\.chatic\.io\/\?code=/
        );
    });

    it('defaults the base to the current dev domain', () => {
        expect(buildInviteRedirectUrl(SHARE_LINK).startsWith(DEFAULT_INVITE_REDIRECT_BASE)).toBe(true);
    });

    it('converts a relay share link into a `relay=1` redirect with no _backend', () => {
        const url = new URL(buildInviteRedirectUrl('https://app-dev.chatic.io/s?code=invt%3A910432%3Aabc&relay'));

        expect(url.searchParams.get('code')).toBe('invt:910432:abc');
        expect(url.searchParams.get('provider')).toBe('invite');
        expect(url.searchParams.get('version')).toBe('2');
        expect(url.searchParams.get('relay')).toBe('1');
        expect(url.searchParams.has('_backend')).toBe(false);
    });

    it('accepts a relay link with a valueless flag and without api/stage', () => {
        // A bare `&relay` reads as an empty string, so presence — not truthiness — is the discriminator.
        expect(buildInviteRedirectUrl('https://app-dev.chatic.io/s?code=c&relay')).toBe(
            'https://dou-dev.chatic.io/?code=c&provider=invite&version=2&relay=1'
        );
        expect(buildInviteRedirectUrl('https://app-dev.chatic.io/s?code=c&relay=')).toContain('relay=1');
    });

    it('still requires code for a relay link', () => {
        expect(() => buildInviteRedirectUrl('https://app-dev.chatic.io/s?relay')).toThrow('code');
    });

    it('throws a descriptive error for an invalid URL or missing params', () => {
        expect(() => buildInviteRedirectUrl('not-a-url')).toThrow('유효한 URL이 아닙니다.');
        expect(() => buildInviteRedirectUrl('https://app-dev.chatic.io/s?api=x&stage=dev')).toThrow('code');
        expect(() => buildInviteRedirectUrl('https://app-dev.chatic.io/s?code=c&stage=dev')).toThrow('api');
        expect(() => buildInviteRedirectUrl('https://app-dev.chatic.io/s?code=c&api=x')).toThrow('stage');
    });
});
