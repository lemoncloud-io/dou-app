import { decodeInviteLink, isEncodedInviteUrl } from './inviteLink';

/**
 * Encodes a payload the way the server does, using Node's own base64url rather than the module
 * under test — a helper built from the same code it verifies would agree with any bug it has.
 */
const link = (payload: Record<string, unknown>, path = '/i'): string =>
    `https://app.chatic.io${path}?t=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

const CODE = 'invt:U9f2a1-3:6b1d4e08-7c2a-4f55-9e31-0a8b3c5d7e91';

describe('isEncodedInviteUrl — /i 링크 판정', () => {
    it.each([
        ['https://app.chatic.io/i?t=abc', true],
        ['https://app.chatic.io/i/?t=abc', true],
        // A `/i` with no token is still ours. "Broken link of ours" and "not our link" get
        // different fallbacks, and only decoding can tell them apart.
        ['https://app.chatic.io/i', true],
        ['/i?t=abc', true],
        ['https://app.chatic.io/s?code=x', false],
        ['https://app.chatic.io/invite/accept?code=x', false],
        ['https://app.chatic.io/images/logo.png', false],
        ['not a url at all', false],
    ])('%s → %s', (url, expected) => {
        expect(isEncodedInviteUrl(url)).toBe(expected);
    });
});

describe('decodeInviteLink — payload 해독', () => {
    it('{c,a,s}는 좌표를 REST 주소로 조립한다', () => {
        expect(decodeInviteLink(link({ c: CODE, a: 'a1b2c3d4e5', s: 'prod' }))).toEqual({
            code: CODE,
            relay: false,
            backend: 'https://a1b2c3d4e5.execute-api.ap-northeast-2.amazonaws.com/prod',
        });
    });

    it('{c,r:1}은 relay이고 주소를 갖지 않는다', () => {
        expect(decodeInviteLink(link({ c: CODE, r: 1 }))).toEqual({ code: CODE, relay: true });
    });

    it('{c}는 relay가 아니고 주소도 없다 — 좌표 부재를 relay로 읽지 않는다', () => {
        expect(decodeInviteLink(link({ c: CODE }))).toEqual({ code: CODE, relay: false });
    });

    it('r이 truthy면 a·s가 함께 와도 무시한다 — relay 서버에는 붙을 주소가 없다', () => {
        expect(decodeInviteLink(link({ c: CODE, r: 1, a: 'a1b2c3d4e5', s: 'prod' }))).toEqual({
            code: CODE,
            relay: true,
        });
    });

    it('a만 있으면 주소를 만들지 않는다 — 반쪽 주소는 없는 호스트를 가리킨다', () => {
        expect(decodeInviteLink(link({ c: CODE, a: 'a1b2c3d4e5' }))).toEqual({ code: CODE, relay: false });
    });

    it('s만 있어도 주소를 만들지 않는다', () => {
        expect(decodeInviteLink(link({ c: CODE, s: 'prod' }))).toEqual({ code: CODE, relay: false });
    });

    it('code가 없으면 null이다 — 코드 없는 초대는 수락할 것이 없다', () => {
        expect(decodeInviteLink(link({ a: 'a1b2c3d4e5', s: 'prod' }))).toBeNull();
    });

    it('t 파라미터가 없으면 null이다', () => {
        expect(decodeInviteLink('https://app.chatic.io/i')).toBeNull();
    });

    it.each([
        ['빈 t', 'https://app.chatic.io/i?t='],
        ['base64 알파벳 밖의 문자', 'https://app.chatic.io/i?t=!!!not-base64!!!'],
        ['base64는 맞지만 JSON이 아님', `https://app.chatic.io/i?t=${Buffer.from('{"c":').toString('base64url')}`],
        ['JSON이지만 객체가 아님', `https://app.chatic.io/i?t=${Buffer.from('["invt:1:2"]').toString('base64url')}`],
        ['깨진 UTF-8 바이트', `https://app.chatic.io/i?t=${Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')}`],
        ['파싱 불가능한 URL', 'http://[::1/i?t=abc'],
    ])('%s → null', (_label, url) => {
        expect(decodeInviteLink(url)).toBeNull();
    });

    // A throwing decoder dies inside landing's catch, which only flips a loading flag and tells
    // the user nothing at all.
    it('어떤 입력에도 던지지 않는다', () => {
        const inputs = ['', '/i', '/i?t=%%%', 'http://[::1/i?t=abc', `https://app.chatic.io/i?t=${'A'.repeat(5000)}`];
        inputs.forEach(input => {
            expect(() => decodeInviteLink(input)).not.toThrow();
            expect(() => isEncodedInviteUrl(input)).not.toThrow();
        });
    });

    it('비ASCII payload가 깨지지 않는다', () => {
        const code = 'invt:우리집🏠:홍길동';
        const url = link({ c: code, r: 1 });
        // Pin that the input really carries a url-safe character an `atob` route would choke on.
        expect(url).toContain('-');
        expect(decodeInviteLink(url)?.code).toBe(code);
    });

    it('url-safe 치환 문자(_)가 든 토큰도 푼다', () => {
        const code = 'invt:?~>?~>:??';
        const url = link({ c: code });
        expect(url).toContain('_');
        expect(decodeInviteLink(url)?.code).toBe(code);
    });

    it('패딩이 붙은 토큰도 푼다 — 표준 base64 패딩은 선택이다', () => {
        const padded = Buffer.from(JSON.stringify({ c: CODE, r: 1 })).toString('base64url');
        expect(decodeInviteLink(`https://app.chatic.io/i?t=${padded}%3D%3D`)).toEqual({ code: CODE, relay: true });
    });

    it('호스트 없는 상대 링크도 푼다 — web 라우트는 location.search만 쥐고 있다', () => {
        const token = Buffer.from(JSON.stringify({ c: CODE, a: 'uzjpiaey7a', s: 'dev' })).toString('base64url');
        expect(decodeInviteLink(`/i?t=${token}`)).toEqual({
            code: CODE,
            relay: false,
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });
});
