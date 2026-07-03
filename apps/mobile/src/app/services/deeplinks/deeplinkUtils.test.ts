// Mock react-native-config: the module is imported at load time even though the functions under
// test here don't read it.
import { convertShortUrlWithEnvsSync } from './deeplinkUtils';

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
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=ABC123&api=myapi&stage=dev'
        );

        // No scheme/host baked in — starts at root so toLocalUrl can prepend WEBVIEW_URL.
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
    it('초대가 아닌 커스텀 스킴 URL은 변환 없이 그대로 통과시킨다 (toLocalUrl이 정규화)', () => {
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
