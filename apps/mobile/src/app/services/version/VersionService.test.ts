import { isNewerVersion, parseVersion, VersionService } from './VersionService';
import type { ILogService } from '../log';

import DeviceInfo from 'react-native-device-info';
import { Linking, Platform } from 'react-native';

jest.mock('react-native-device-info', () => ({
    __esModule: true,
    default: { getVersion: jest.fn(() => '1.2.0') },
}));

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@chatic/shared', () => ({
    getStoreUrl: jest.fn((platform: string) =>
        platform === 'ios'
            ? 'https://apps.apple.com/app/id6758658673'
            : 'https://play.google.com/store/apps/details?id=io.chatic.dou'
    ),
}));

let mockFetch: jest.Mock;

describe('parseVersion / isNewerVersion', () => {
    it('버전 문자열을 숫자 파트로 분해한다', () => {
        expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion('1.2')).toEqual([1, 2]);
    });

    it('latest가 current보다 높으면 true를 반환한다', () => {
        expect(isNewerVersion('1.3.0', '1.2.9')).toBe(true);
        expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    });

    it('latest가 current와 같거나 낮으면 false를 반환한다', () => {
        expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
        expect(isNewerVersion('1.1.0', '1.2.0')).toBe(false);
    });
});

describe('VersionService', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;
    let service: VersionService;

    beforeEach(() => {
        jest.clearAllMocks();
        (Platform as { OS: string }).OS = 'ios';
        (DeviceInfo.getVersion as jest.Mock).mockReturnValue('1.2.0');
        mockFetch = jest.fn();
        (global as { fetch: jest.Mock }).fetch = mockFetch;
        service = new VersionService(logger);
    });

    it('iOS에서 라이브 버전이 더 최신이면 updateAvailable: true를 반환한다', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.3.0' }] }),
        });

        const result = await service.checkForUpdate();

        expect(result).toEqual({
            platform: 'ios',
            currentVersion: '1.2.0',
            latestVersion: '1.3.0',
            updateAvailable: true,
            storeUrl: 'https://apps.apple.com/app/id6758658673',
        });
    });

    it('라이브 버전이 현재 버전과 같으면 updateAvailable: false를 반환한다', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.2.0' }] }),
        });

        const result = await service.checkForUpdate();

        expect(result.updateAvailable).toBe(false);
    });

    it('조회 실패(HTTP 에러) 시 안전하게 updateAvailable: false로 폴백하고 캐시하지 않는다', async () => {
        mockFetch.mockResolvedValue({ ok: false });

        const first = await service.checkForUpdate();
        expect(first.updateAvailable).toBe(false);
        expect(first.latestVersion).toBe('1.2.0');

        // A later call retries the lookup instead of reusing a failed result.
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.3.0' }] }),
        });
        const second = await service.checkForUpdate();
        expect(second.updateAvailable).toBe(true);
    });

    it('네트워크 예외 발생 시 안전하게 updateAvailable: false로 폴백한다', async () => {
        mockFetch.mockRejectedValue(new Error('network down'));

        const result = await service.checkForUpdate();

        expect(result.updateAvailable).toBe(false);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('성공한 조회 결과는 TTL 내 두 번째 호출에서 재조회하지 않는다', async () => {
        const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.3.0' }] }),
        });

        await service.checkForUpdate();
        dateNowSpy.mockReturnValue(1_000_000 + 60_000); // 1 minute later, well within the 30-minute TTL
        await service.checkForUpdate();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        dateNowSpy.mockRestore();
    });

    it('TTL이 지나면 캐시를 버리고 다시 조회한다 (장기 세션에서도 새 버전을 놓치지 않기 위함)', async () => {
        const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.3.0' }] }),
        });

        await service.checkForUpdate();
        dateNowSpy.mockReturnValue(1_000_000 + 31 * 60 * 1000); // 31 minutes later, past the 30-minute TTL
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ resultCount: 1, results: [{ version: '1.4.0' }] }),
        });
        const result = await service.checkForUpdate();

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.latestVersion).toBe('1.4.0');
        dateNowSpy.mockRestore();
    });

    it('Android는 라이브 버전 소스가 없어 항상 updateAvailable: false를 반환한다', async () => {
        (Platform as { OS: string }).OS = 'android';

        const result = await service.checkForUpdate();

        expect(result).toEqual({
            platform: 'android',
            currentVersion: '1.2.0',
            latestVersion: '1.2.0',
            updateAvailable: false,
            storeUrl: 'https://play.google.com/store/apps/details?id=io.chatic.dou',
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('openStore는 현재 플랫폼의 스토어 URL을 연다', async () => {
        await service.openStore();

        expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id6758658673');
    });
});
