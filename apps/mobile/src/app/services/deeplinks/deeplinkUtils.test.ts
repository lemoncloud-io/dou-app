// Mock react-native-config: `getAppScheme` reads VITE_ENV, and the module is imported at load time
// by the rest of this file regardless. The getAppScheme block below mutates and restores it.
import Config from 'react-native-config';

import {
    convertShortUrlWithEnvsSync,
    getAppScheme,
    isNewPatternInviteUrl,
    isShortUrl,
    resolveDeepLink,
    resolvePushTapPath,
} from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

// `@chatic/shared` is imported for its invite-link decoder, but its barrel also re-exports web-only
// components that reach `@chatic/assets`, whose `import.meta.url` the CommonJS test transform cannot
// parse. Point the specifier at the decoder module itself: the REAL decoder still runs here, which
// is the point — the production bundler has no such limitation and takes the barrel as written.
// Same workaround as useAppVersionCheck.test.ts / VersionService.test.ts, which stub it outright.
jest.mock('@chatic/shared', () => jest.requireActual('../../../../../../libs/shared/src/utils/inviteLink'));

// The converter emits a host-less relative URL; parse against a throwaway base to inspect it.
const PARSE_BASE = 'https://base.local';

describe('convertShortUrlWithEnvsSync (신규 패턴 초대 링크)', () => {
    it('초대 링크를 /auth/login이 아닌 루트(/)로 변환하고 provider/code/_backend를 포함한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=ABC123&backend=https://api.example.com'
        );

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.pathname).toBe('/');
        expect(parsed.searchParams.get('provider')).toBe('invite');
        expect(parsed.searchParams.get('version')).toBe('2');
        expect(parsed.searchParams.get('code')).toBe('ABC123');
        expect(parsed.searchParams.get('_backend')).toBe('https://api.example.com');
    });

    it('backend가 없고 api+stage만 있으면 백엔드 URL을 조립해 _backend에 넣는다', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&api=myapi&stage=prod');

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('_backend')).toBe('https://myapi.execute-api.ap-northeast-2.amazonaws.com/prod');
    });

    it('초대와 무관한 그 외 쿼리 파라미터는 그대로 전달한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=ABC123&backend=https://api.example.com&utm_source=kakao'
        );

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('utm_source')).toBe('kakao');
    });

    it('출력은 프론트 도메인이 박히지 않은 상대 경로다 (도메인은 WEBVIEW_URL로 하위 일원화)', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&api=myapi&stage=dev');

        // No scheme/host baked in — starts at root so the WebView base (WEBVIEW_URL) is applied downstream.
        // (The encoded `_backend` value legitimately contains an https URL, so we only assert the
        // absence of the frontend host, not the substring "http".)
        expect(url.startsWith('/?')).toBe(true);
        expect(url).not.toContain('chatic.io');
    });

    it('실제 초대 인풋을 인식 가능한 최종 폼 포맷으로 변환한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=invt%3A910447%3A56fda796-090c-40e5-9dfc-bd7523ad2ab7&api=uzjpiaey7a&stage=dev'
        );

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('code')).toBe('invt:910447:56fda796-090c-40e5-9dfc-bd7523ad2ab7');
        expect(parsed.searchParams.get('provider')).toBe('invite');
        expect(parsed.searchParams.get('version')).toBe('2');
        expect(parsed.searchParams.get('_backend')).toBe(
            'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev'
        );
    });

    it('초대 쿼리가 통째로 유실되지 않고 상대 경로로 보존된다 (RN URL 회귀 방지)', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=invt%3A910457%3Ab1a86d2c-584e-4195-acaa-b5643417e2e0&api=uzjpiaey7a&stage=dev'
        );

        // Assert the raw string, not a re-parsed URL: the RN regression collapsed this to "/", and
        // re-parsing with Node's URL would mask that. Order is deterministic: code, provider, version, _backend.
        expect(url).toBe(
            '/?code=invt%3A910457%3Ab1a86d2c-584e-4195-acaa-b5643417e2e0' +
                '&provider=invite&version=2' +
                '&_backend=https%3A%2F%2Fuzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com%2Fdev'
        );
    });
});

describe('convertShortUrlWithEnvsSync (릴레이 서버 초대 링크)', () => {
    it('relay 플래그만 있는 링크를 relay=1 마커로 변환하고 _backend는 넣지 않는다', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&relay');

        // Assert the raw string: order is deterministic (code, provider, version, relay).
        expect(url).toBe('/?code=ABC123&provider=invite&version=2&relay=1');

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.pathname).toBe('/');
        expect(parsed.searchParams.get('provider')).toBe('invite');
        expect(parsed.searchParams.get('version')).toBe('2');
        expect(parsed.searchParams.get('relay')).toBe('1');
        expect(parsed.searchParams.has('_backend')).toBe(false);
    });

    it('값 없는 &relay(빈 문자열)도 릴레이로 인식한다 (get 진위값이 아니라 존재 여부로 판별)', () => {
        // `get('relay')` is '' here, so a truthiness check would misread this as a non-relay link.
        const bare = new URL('https://app-dev.chatic.io/s?code=ABC123&relay');
        expect(bare.searchParams.get('relay')).toBe('');

        expect(convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&relay=').url).toBe(
            '/?code=ABC123&provider=invite&version=2&relay=1'
        );
        expect(convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?relay&code=ABC123').url).toBe(
            '/?code=ABC123&provider=invite&version=2&relay=1'
        );
    });

    it('릴레이 링크도 초대와 무관한 그 외 쿼리 파라미터를 그대로 전달한다 (relay는 중복 전달하지 않음)', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&relay&utm_source=kakao');

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('utm_source')).toBe('kakao');
        // Consumed by the converter, so it is emitted exactly once in its canonical form.
        expect(parsed.searchParams.getAll('relay')).toEqual(['1']);
    });

    it('클라우드 폼(api+stage)은 그대로 _backend를 만들고 relay 마커를 붙이지 않는다', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&api=myapi&stage=prod');

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('_backend')).toBe('https://myapi.execute-api.ap-northeast-2.amazonaws.com/prod');
        expect(parsed.searchParams.has('relay')).toBe(false);
    });
});

describe('convertShortUrlWithEnvsSync (인코딩 초대 링크 /i)', () => {
    // Encoded the way the server does, with Node's own base64url — never with the decoder under test.
    const token = (payload: Record<string, unknown>): string =>
        Buffer.from(JSON.stringify(payload)).toString('base64url');

    const CODE = 'invt:1000072-2:e3faf0d0';

    it('{c,a,s}는 좌표를 _backend로 펼쳐 루트(/)로 변환한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            `https://app-dev.chatic.io/i?t=${token({ c: CODE, a: 'myapi', s: 'prod' })}`
        );

        // Asserted as an exact string, not through URLSearchParams: React Native's URL builds
        // `.search` from the raw text, so only the assembled string proves the query survived.
        expect(url).toBe(
            '/?code=invt%3A1000072-2%3Ae3faf0d0&provider=invite&version=2' +
                '&_backend=https%3A%2F%2Fmyapi.execute-api.ap-northeast-2.amazonaws.com%2Fprod'
        );
    });

    it('{c,r:1}은 relay=1을 달고 _backend를 갖지 않는다', () => {
        const { url } = convertShortUrlWithEnvsSync(`https://app-dev.chatic.io/i?t=${token({ c: CODE, r: 1 })}`);

        expect(url).toBe('/?code=invt%3A1000072-2%3Ae3faf0d0&provider=invite&version=2&relay=1');
    });

    it('좌표 없는 {c}는 relay로 읽지 않는다 — 표식 없이 넘긴다', () => {
        const { url } = convertShortUrlWithEnvsSync(`https://app-dev.chatic.io/i?t=${token({ c: CODE })}`);

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('code')).toBe(CODE);
        expect(parsed.searchParams.has('relay')).toBe(false);
        expect(parsed.searchParams.has('_backend')).toBe(false);
    });

    it('r이 truthy면 좌표가 함께 와도 relay다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            `https://app-dev.chatic.io/i?t=${token({ c: CODE, r: 1, a: 'myapi', s: 'prod' })}`
        );

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('relay')).toBe('1');
        expect(parsed.searchParams.has('_backend')).toBe(false);
    });

    it('커스텀 스킴으로 들어온 /i도 같은 결과를 낸다', () => {
        const { url } = convertShortUrlWithEnvsSync(`chatic-dev://i?t=${token({ c: CODE, r: 1 })}`);

        expect(url).toBe('/?code=invt%3A1000072-2%3Ae3faf0d0&provider=invite&version=2&relay=1');
    });

    it('t 밖의 파라미터는 그대로 전달한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            `https://app-dev.chatic.io/i?t=${token({ c: CODE, r: 1 })}&utm_source=kakao`
        );

        const parsed = new URL(url, PARSE_BASE);
        expect(parsed.searchParams.get('utm_source')).toBe('kakao');
        expect(parsed.searchParams.has('t')).toBe(false);
    });

    it.each([
        ['t가 없는 /i', 'https://app-dev.chatic.io/i'],
        ['풀 수 없는 t', 'https://app-dev.chatic.io/i?t=!!!not-base64!!!'],
        ['code 없는 payload', `https://app-dev.chatic.io/i?t=${token({ a: 'myapi', s: 'prod' })}`],
    ])('%s는 던진다 — /s가 code 없을 때 던지는 자리와 같다', (_label, input) => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => convertShortUrlWithEnvsSync(input)).toThrow('Unreadable encoded invite link');
    });

    // Neither `/s` predicate was changed to make this true; this pins that it already was, so a
    // later edit to them cannot quietly start claiming `/i`.
    it('기존 /s 판정기들은 /i를 자기 것으로 보지 않는다', () => {
        const link = `https://app-dev.chatic.io/i?t=${token({ c: CODE, r: 1 })}`;

        expect(isShortUrl(link)).toBe(false);
        expect(isNewPatternInviteUrl(link)).toBe(false);
    });

    it('resolveDeepLink가 /i를 web 경로로 해석한다', () => {
        const result = resolveDeepLink(`/i?t=${token({ c: CODE, r: 1 })}`);

        expect(result).toEqual({
            kind: 'web',
            path: '/?code=invt%3A1000072-2%3Ae3faf0d0&provider=invite&version=2&relay=1',
        });
    });
});

describe('convertShortUrlWithEnvsSync (비초대 링크)', () => {
    it('초대가 아닌 커스텀 스킴 URL은 변환 없이 그대로 통과시킨다 (resolveWebPath가 정규화)', () => {
        const input = 'chatic-dev://auth/login?code=123';
        const { url } = convertShortUrlWithEnvsSync(input);
        expect(url).toBe(input);
    });

    it('구식 파이어스토어 short URL(/s/{code})은 더 이상 지원하지 않고 에러를 던진다', () => {
        expect(() => convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s/oldcode123')).toThrow(
            'Old style shortcode invite links are no longer supported'
        );
    });
});

describe('resolveDeepLink (통합 해석기)', () => {
    it('초대 링크를 web 경로로 해석하고 provider/code를 보존한다', () => {
        const result = resolveDeepLink('https://app-dev.chatic.io/s?code=ABC123&backend=https://api.example.com');

        expect(result.kind).toBe('web');
        // Narrow the discriminated union so path is accessible.
        if (result.kind === 'web') {
            const parsed = new URL(result.path, PARSE_BASE);
            expect(parsed.searchParams.get('provider')).toBe('invite');
            expect(parsed.searchParams.get('code')).toBe('ABC123');
        }
    });

    it('릴레이 초대 링크도 web 경로로 해석한다 (예전에는 통과되어 웹에서 유실됐다)', () => {
        const result = resolveDeepLink('https://app-dev.chatic.io/s?code=ABC123&relay');

        expect(result).toEqual({ kind: 'web', path: '/?code=ABC123&provider=invite&version=2&relay=1' });
    });

    it('비초대 커스텀 스킴은 host 없는 pathname+search 상대 경로로 축약한다', () => {
        const result = resolveDeepLink('chatic-dev://auth/login?code=123');
        expect(result).toEqual({ kind: 'web', path: '/auth/login?code=123' });
    });

    it('leading-slash 경로(웜 스타트)를 스킴 복원 후 해석한다', () => {
        const result = resolveDeepLink('/s?code=invt:1:t&api=dev');

        expect(result.kind).toBe('web');
        if (result.kind === 'web') {
            expect(result.path).toContain('provider=invite');
            expect(result.path).toContain('code=invt%3A1%3At');
        }
    });

    it('target=native 디버그 링크를 native 상태로 해석한다 (target 파라미터는 제거)', () => {
        const result = resolveDeepLink('chatic://debug/DeeplinkTest?target=native&param1=hello');

        expect(result).toEqual({
            kind: 'native',
            state: {
                routes: [{ name: 'Debug', state: { routes: [{ name: 'DeeplinkTest', params: { param1: 'hello' } }] } }],
            },
        });
    });

    it('알 수 없는 디버그 화면은 Home으로 폴백한다', () => {
        const result = resolveDeepLink('chatic://debug/UnknownScreen?target=native');

        expect(result).toEqual({
            kind: 'native',
            state: { routes: [{ name: 'Debug', state: { routes: [{ name: 'Home', params: undefined }] } }] },
        });
    });

    it('target=native main/modal은 Modal 라우트로 해석하고 url 파라미터를 전달한다', () => {
        const result = resolveDeepLink('chatic://main/modal?target=native&url=https://chatic.io');

        // Flat single-level route after the navigator merge (boot-optimization.md 4.3): Modal is a
        // top-level route, no longer nested under Main.
        expect(result).toEqual({
            kind: 'native',
            state: {
                routes: [{ name: 'Modal', params: { url: 'https://chatic.io' } }],
            },
        });
    });

    it('알 수 없는 native 라우트는 Main으로 폴백한다', () => {
        const result = resolveDeepLink('chatic://completelyUnknownRoute?target=native');

        // Flat single-level Main route after the navigator merge (boot-optimization.md 4.3).
        expect(result).toEqual({
            kind: 'native',
            state: { routes: [{ name: 'Main' }] },
        });
    });

    it('알 수 없는 스킴은 invalid를 반환한다', () => {
        const result = resolveDeepLink('unsupported://xyz');
        expect(result.kind).toBe('invalid');
    });

    it('구식 /s/{code} 쇼트코드는 invalid로 처리한다 (변환기가 던지는 에러를 흡수)', () => {
        const result = resolveDeepLink('https://app-dev.chatic.io/s/oldcode123');
        expect(result.kind).toBe('invalid');
    });
});

describe('resolvePushTapPath (푸시 탭 경로)', () => {
    it('스펙형 상대 link와 payload(JSON 문자열)의 cid/sid를 쿼리로 병합한다', () => {
        const path = resolvePushTapPath({
            link: 'channel?channelId=room_123',
            payload: JSON.stringify({ cid: 'cloud_1', sid: '100002', uid: 'user_456' }),
        });

        // Relative link keeps its own query; cid/sid are appended for the web to consume.
        expect(path).toBe('/channel?channelId=room_123&cid=cloud_1&sid=100002');
    });

    it('웹 정렬 절대 경로 link와 payload 객체의 cid/sid를 병합하고 기존 쿼리를 보존한다', () => {
        const path = resolvePushTapPath({
            link: '/channels/1000001/room?tab=info',
            payload: { cid: 'cloud_1', sid: 'site_9' },
        });

        expect(path).toBe('/channels/1000001/room?tab=info&cid=cloud_1&sid=site_9');
    });

    it('cid/sid가 없으면 link 경로를 그대로 반환한다', () => {
        expect(resolvePushTapPath({ link: '/channels/1000001/room' })).toBe('/channels/1000001/room');
    });

    it('link가 없으면 null을 반환해 강제 네비게이션을 하지 않는다', () => {
        expect(resolvePushTapPath({ payload: JSON.stringify({ cid: 'cloud_1' }) })).toBeNull();
        expect(resolvePushTapPath({ link: '   ' })).toBeNull();
        expect(resolvePushTapPath(undefined)).toBeNull();
    });

    // A cloud-activation push has no link, by contract. The spec's source of truth says "if link
    // is empty, go to root", and if a tap only brings the app to the foreground, the user taps the
    // notification and goes nowhere.
    it('클라우드 활성 푸시는 link가 없어도 루트로 보낸다', () => {
        expect(resolvePushTapPath({ type: 'cloud', cid: 'cloud_1', uid: 'u1' })).toBe('/');
        expect(resolvePushTapPath({ type: 'cloud', payload: JSON.stringify({ cid: 'cloud_1' }) })).toBe('/');
    });

    // The no-link-goes-to-root fallback is only granted to types that have no link by contract.
    // A chat push missing its link is a malformed payload, not a request to go home — it shouldn't
    // steal the screen the user was looking at.
    it('클라우드가 아닌 유형은 link가 없으면 그대로 null이다', () => {
        expect(resolvePushTapPath({ type: 'chat', payload: JSON.stringify({ cid: 'cloud_1' }) })).toBeNull();
        expect(resolvePushTapPath({ type: 'notice' })).toBeNull();
    });

    // If a link exists, it wins regardless of type — the root fallback branch only runs when there's no link.
    it('클라우드 푸시라도 link가 있으면 link를 따른다', () => {
        expect(resolvePushTapPath({ type: 'cloud', link: '/mypage/clouds' })).toBe('/mypage/clouds');
    });

    // An Android background tap never goes through this function — native carries the scheme root
    // in the intent's data URI, and RN Linking → resolveDeepLink receives it. Whether that URI
    // actually resolves to root is the contract being tested here
    // (see ChaticFirebaseMessagingService.rootTapLinkFor).
    it('네이티브가 싣는 스킴 루트 URI는 웹 루트로 풀린다', () => {
        expect(resolveDeepLink('chatic://')).toEqual({ kind: 'web', path: '/' });
        expect(resolveDeepLink('chatic-dev://')).toEqual({ kind: 'web', path: '/' });
    });

    it('커스텀 스킴 link는 스킴을 벗기고 경로/쿼리만 취한다', () => {
        const path = resolvePushTapPath({
            link: 'chatic-dev://channel?channelId=room_123',
            payload: { cid: 'cloud_1' },
        });

        expect(path).toBe('/channel?channelId=room_123&cid=cloud_1');
    });

    it('link 쿼리에 이미 cid가 있으면 payload 값으로 덮어쓰지 않는다', () => {
        const path = resolvePushTapPath({
            link: '/channels/1/room?cid=explicit',
            payload: { cid: 'from_payload', sid: 'site_9' },
        });

        // Existing cid is preserved; only the missing sid is added.
        expect(path).toBe('/channels/1/room?cid=explicit&sid=site_9');
    });

    it('payload JSON이 깨졌으면 top-level cid/sid로 폴백한다', () => {
        const path = resolvePushTapPath({
            link: '/channels/1/room',
            payload: '{not valid json',
            cid: 'top_cloud',
            sid: 'top_site',
        });

        expect(path).toBe('/channels/1/room?cid=top_cloud&sid=top_site');
    });

    it('link가 없고 clickAction만 있으면 clickAction을 사용한다', () => {
        const path = resolvePushTapPath({
            clickAction: '/channels/1/room',
            payload: { cid: 'cloud_1' },
        });

        expect(path).toBe('/channels/1/room?cid=cloud_1');
    });
});

describe('getAppScheme (OS 등록 스킴과의 일치)', () => {
    const originalEnv = Config.VITE_ENV;

    afterEach(() => {
        Config.VITE_ENV = originalEnv;
    });

    // The polarity is `=== 'PROD'`, not `=== 'DEV'`: every non-prod build configuration registers
    // `chatic-dev` with the OS (iOS `APP_URL_SCHEME`, Android `appScheme`), so LOCAL must land there
    // too. See apps/mobile/docs/release/local-run.md.
    it.each([
        ['PROD', 'chatic'],
        ['DEV', 'chatic-dev'],
        ['LOCAL', 'chatic-dev'],
    ])('VITE_ENV=%s이면 %s를 쓴다', (env, expected) => {
        Config.VITE_ENV = env;

        expect(getAppScheme()).toBe(expected);
    });

    it('VITE_ENV가 비어 있으면 prod가 아니므로 chatic-dev로 떨어진다', () => {
        Config.VITE_ENV = '';

        expect(getAppScheme()).toBe('chatic-dev');
    });

    // Asserts the reconstructed URL, not just that it resolved: VALID_SCHEMES accepts BOTH
    // 'chatic' and 'chatic-dev', so a `kind !== 'invalid'` check passes on either scheme and
    // would not catch the mismatch this function exists to prevent.
    it.each([
        ['LOCAL', 'chatic-dev://channels/1/room'],
        ['DEV', 'chatic-dev://channels/1/room'],
        ['PROD', 'chatic://channels/1/room'],
    ])('VITE_ENV=%s이면 warm-start 경로를 %s로 재조립한다', (env, expected) => {
        Config.VITE_ENV = env;
        const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), subscribe: jest.fn() };

        resolveDeepLink('/channels/1/room', logger as never);

        expect(logger.info).toHaveBeenCalledWith(
            'DEEPLINK',
            expect.any(String),
            expect.objectContaining({ fullUrl: expected })
        );
    });
});
