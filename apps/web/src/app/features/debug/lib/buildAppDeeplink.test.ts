import { buildAppDeeplink } from './buildAppDeeplink';
import { runtime } from '@chatic/runtime';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({ settings: { get: jest.fn() } })
);

const mockGet = runtime.settings.get as jest.Mock;

describe('buildAppDeeplink', () => {
    beforeEach(() => mockGet.mockReset());

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

    it('이미 스킴이 붙은 입력은 건드리지 않는다', () => {
        mockGet.mockReturnValue('chatic-dev');

        expect(buildAppDeeplink('chatic://s?code=invt:1:a')).toBe('chatic://s?code=invt:1:a');
        expect(buildAppDeeplink('https://app.chatic.io/s?code=x')).toBe('https://app.chatic.io/s?code=x');
    });

    it('빈 입력은 빈 문자열이다 — 호출부가 버튼을 잠그면 된다', () => {
        expect(buildAppDeeplink('   ')).toBe('');
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('스킴을 못 읽으면 chatic으로 떨어진다', () => {
        mockGet.mockReturnValue(undefined);

        expect(buildAppDeeplink('/home')).toBe('chatic://home');
    });
});
