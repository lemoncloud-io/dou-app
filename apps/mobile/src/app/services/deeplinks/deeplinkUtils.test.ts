// Mock react-native-config: the module is imported at load time even though the functions under
// test here don't read it.
import { convertShortUrlWithEnvsSync } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

describe('convertShortUrlWithEnvsSync (신규 패턴 초대 링크)', () => {
    it('초대 링크를 /auth/login이 아닌 루트(/)로 변환하고 provider/code/_backend를 포함한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=ABC123&backend=https://api.example.com'
        );

        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/');
        expect(parsed.searchParams.get('provider')).toBe('invite');
        expect(parsed.searchParams.get('code')).toBe('ABC123');
        expect(parsed.searchParams.get('_backend')).toBe('https://api.example.com');
    });

    it('backend가 없고 api+stage만 있으면 백엔드 URL을 조립해 _backend에 넣는다', () => {
        const { url } = convertShortUrlWithEnvsSync('https://app-dev.chatic.io/s?code=ABC123&api=myapi&stage=prod');

        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/');
        expect(parsed.searchParams.get('_backend')).toBe('https://myapi.execute-api.ap-northeast-2.amazonaws.com/prod');
    });

    it('초대와 무관한 그 외 쿼리 파라미터는 그대로 전달한다', () => {
        const { url } = convertShortUrlWithEnvsSync(
            'https://app-dev.chatic.io/s?code=ABC123&backend=https://api.example.com&utm_source=kakao'
        );

        const parsed = new URL(url);
        expect(parsed.searchParams.get('utm_source')).toBe('kakao');
    });
});
