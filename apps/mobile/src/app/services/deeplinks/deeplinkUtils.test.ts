// Mock react-native-config: the module is imported at load time even though the functions under
// test here don't read it.
import { convertShortUrlWithEnvsSync, resolveDeepLink, resolvePushTapPath } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

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

        expect(result).toEqual({
            kind: 'native',
            state: {
                routes: [
                    { name: 'Main', state: { routes: [{ name: 'Modal', params: { url: 'https://chatic.io' } }] } },
                ],
            },
        });
    });

    it('알 수 없는 native 라우트는 Main으로 폴백한다', () => {
        const result = resolveDeepLink('chatic://completelyUnknownRoute?target=native');

        expect(result).toEqual({
            kind: 'native',
            state: { routes: [{ name: 'Main', state: { routes: [{ name: 'Main' }] } }] },
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
