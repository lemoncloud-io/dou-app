import { buildAppDeeplink } from './buildAppDeeplink';
import { config } from '@chatic/config';

jest.mock('@chatic/config', () => ({ config: { get: jest.fn() } }));

const mockGet = config.get as jest.Mock;

describe('buildAppDeeplink', () => {
    beforeEach(() => mockGet.mockReset());

    // A hardcoded 'chatic' would open the prod app from a dev build — this actually matters on a device with both channels installed.
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

    // Also under test: that another channel's scheme doesn't get caught by this build — hence it passes through untouched.
    it('이미 스킴이 붙은 입력은 건드리지 않는다', () => {
        mockGet.mockReturnValue('chatic-dev');

        expect(buildAppDeeplink('chatic://s?code=invt:1:a')).toBe('chatic://s?code=invt:1:a');
        expect(buildAppDeeplink('https://app.chatic.io/s?code=x')).toBe('https://app.chatic.io/s?code=x');
    });

    it('빈 입력은 빈 문자열이다 — 호출부가 버튼을 잠그면 된다', () => {
        expect(buildAppDeeplink('   ')).toBe('');
        expect(mockGet).not.toHaveBeenCalled();
    });

    // The PROD scheme is the default when the registry isn't wired up yet or the key is empty (matches the registry's defaultValue).
    it('스킴을 못 읽으면 chatic으로 떨어진다', () => {
        mockGet.mockReturnValue(undefined);

        expect(buildAppDeeplink('/home')).toBe('chatic://home');
    });
});
