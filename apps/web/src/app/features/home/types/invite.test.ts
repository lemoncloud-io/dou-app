import { isInviteEntry, parseInviteDeeplink } from './invite';

describe('parseInviteDeeplink', () => {
    it('provider, code, backend, version을 딥링크에서 추출한다', () => {
        const params = parseInviteDeeplink('?provider=invite&code=abc&_backend=https://api&_version=2');
        expect(params).toEqual({ provider: 'invite', code: 'abc', backend: 'https://api', version: '2' });
    });

    it('값이 없으면 옵션 필드는 undefined, code는 null로 둔다', () => {
        const params = parseInviteDeeplink('');
        expect(params.provider).toBeUndefined();
        expect(params.code).toBeNull();
        expect(params.backend).toBeUndefined();
        expect(params.version).toBeUndefined();
    });
});

describe('isInviteEntry', () => {
    it('provider=invite이고 code와 _backend가 모두 있으면 true', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&code=abc&_backend=https://api'))).toBe(true);
    });

    it('provider가 invite가 아니면 false', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=oauth&code=abc&_backend=https://api'))).toBe(false);
        expect(isInviteEntry(parseInviteDeeplink('?code=abc&_backend=https://api'))).toBe(false);
    });

    it('code 또는 _backend가 누락되면 false (무시 대상)', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&_backend=https://api'))).toBe(false);
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&code=abc'))).toBe(false);
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite'))).toBe(false);
    });
});
