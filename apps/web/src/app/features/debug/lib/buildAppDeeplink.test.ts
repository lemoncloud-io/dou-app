import { buildAppDeeplink } from './buildAppDeeplink';
import { config } from '@chatic/config';

jest.mock('@chatic/config', () => ({ config: { get: jest.fn() } }));

const mockGet = config.get as jest.Mock;

describe('buildAppDeeplink', () => {
    beforeEach(() => mockGet.mockReset());

    // 하드코딩된 'chatic'이면 dev 빌드에서 prod 앱이 열린다 — 두 채널이 깔린 기기에서 실제로 갈린다.
    it('상대경로에는 이 빌드의 스킴을 붙인다', () => {
        mockGet.mockReturnValue('chatic-dev');

        expect(buildAppDeeplink('/chats')).toBe('chatic-dev://chats');
        expect(mockGet).toHaveBeenCalledWith('net.deeplink.scheme');
    });

    it('앞 슬래시가 없어도 같게 만든다', () => {
        mockGet.mockReturnValue('chatic');

        expect(buildAppDeeplink('home')).toBe('chatic://home');
    });

    it('슬래시가 여러 개여도 하나로 정리한다', () => {
        mockGet.mockReturnValue('chatic');

        expect(buildAppDeeplink('///home')).toBe('chatic://home');
    });

    // 다른 채널 스킴이 이 빌드를 잡지 않는지 확인하는 것도 시험 대상이다 — 그래서 그대로 통과시킨다.
    it('이미 스킴이 붙은 입력은 건드리지 않는다', () => {
        mockGet.mockReturnValue('chatic-dev');

        expect(buildAppDeeplink('chatic://s?code=invt:1:a')).toBe('chatic://s?code=invt:1:a');
        expect(buildAppDeeplink('https://app.chatic.io/s?code=x')).toBe('https://app.chatic.io/s?code=x');
    });

    it('빈 입력은 빈 문자열이다 — 호출부가 버튼을 잠그면 된다', () => {
        expect(buildAppDeeplink('   ')).toBe('');
        expect(mockGet).not.toHaveBeenCalled();
    });

    // 레지스트리가 아직 안 붙었거나 키가 비면 PROD 스킴이 기본이다 (레지스트리 defaultValue와 같다).
    it('스킴을 못 읽으면 chatic으로 떨어진다', () => {
        mockGet.mockReturnValue(undefined);

        expect(buildAppDeeplink('/home')).toBe('chatic://home');
    });
});
