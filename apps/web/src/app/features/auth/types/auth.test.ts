import { isInviteDeeplink, parseInviteDeeplink } from './auth';

describe('parseInviteDeeplink', () => {
    it('extracts code, backend and version from the deeplink', () => {
        const params = parseInviteDeeplink('?code=abc&_backend=https://api&_version=2');
        expect(params).toEqual({ code: 'abc', backend: 'https://api', version: '2' });
    });

    it('leaves optional fields undefined and code null when absent', () => {
        const params = parseInviteDeeplink('');
        expect(params.code).toBeNull();
        expect(params.backend).toBeUndefined();
        expect(params.version).toBeUndefined();
    });
});

describe('isInviteDeeplink', () => {
    it('is true only when an invite code is present', () => {
        expect(isInviteDeeplink(parseInviteDeeplink('?code=abc'))).toBe(true);
        expect(isInviteDeeplink(parseInviteDeeplink('?_backend=https://api'))).toBe(false);
        expect(isInviteDeeplink(parseInviteDeeplink(''))).toBe(false);
    });
});
