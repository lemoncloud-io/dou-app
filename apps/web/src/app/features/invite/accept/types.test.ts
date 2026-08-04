import { isInviteEntry, isRelayInvite, parseInviteDeeplink } from './types';

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
        expect(params.relay).toBeUndefined();
    });

    it('릴레이 초대 링크의 relay 마커를 추출한다 (_backend 없음)', () => {
        const params = parseInviteDeeplink('?provider=invite&code=abc&relay=1');
        expect(params).toEqual({ provider: 'invite', code: 'abc', relay: true });
        expect(params.backend).toBeUndefined();
    });

    it('값이 없는 relay(빈 문자열)도 마커로 인식한다 (존재 여부로 판별)', () => {
        expect(parseInviteDeeplink('?provider=invite&code=abc&relay').relay).toBe(true);
        expect(parseInviteDeeplink('?provider=invite&code=abc&relay=').relay).toBe(true);
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

    it('provider=invite이고 code와 relay 마커가 있으면 _backend가 없어도 true', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&code=abc&relay=1'))).toBe(true);
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&code=abc&relay'))).toBe(true);
    });

    it('relay 마커만 있고 code가 없으면 false', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&relay=1'))).toBe(false);
    });

    it('code 또는 _backend가 누락되면 false (무시 대상)', () => {
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&_backend=https://api'))).toBe(false);
        // No `_backend` and no `relay` marker: nothing identifies a target, so the link is ignored.
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite&code=abc'))).toBe(false);
        expect(isInviteEntry(parseInviteDeeplink('?provider=invite'))).toBe(false);
    });
});

describe('isRelayInvite', () => {
    it('초대 진입이면서 relay 마커가 있으면 true', () => {
        expect(isRelayInvite(parseInviteDeeplink('?provider=invite&code=abc&relay=1'))).toBe(true);
        // 릴레이 링크는 _backend를 싣지 않지만, 함께 와도 릴레이로 본다.
        expect(isRelayInvite(parseInviteDeeplink('?provider=invite&code=abc&_backend=https://api&relay'))).toBe(true);
    });

    it('마커가 없으면 클라우드 초대로 본다', () => {
        expect(isRelayInvite(parseInviteDeeplink('?provider=invite&code=abc&_backend=https://api'))).toBe(false);
    });

    it('초대 진입이 아니면 마커가 있어도 false', () => {
        expect(isRelayInvite(parseInviteDeeplink('?provider=oauth&code=abc&_backend=https://api&relay'))).toBe(false);
        expect(isRelayInvite(parseInviteDeeplink('?provider=invite&relay'))).toBe(false);
    });
});
