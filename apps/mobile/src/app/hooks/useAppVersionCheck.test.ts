import { act, renderHook } from '@testing-library/react';

import { Alert, Linking } from 'react-native';
import { getVersionCheckResult, onVersionCheckComplete, useAppVersionCheck } from './useAppVersionCheck';

jest.mock('react-native', () => ({
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn(() => Promise.resolve()) },
    Platform: { OS: 'ios' },
}));

jest.mock('../utils', () => ({
    getAppLanguage: jest.fn(() => 'en'),
    t: (key: string) => key,
}));

jest.mock('@chatic/shared', () => ({
    STORE_URLS: {
        ios: 'https://apps.apple.com/app/id6758658673',
        android: 'https://play.google.com/store/apps/details?id=io.chatic.dou',
    },
}));

const mockCheckForUpdate = jest.fn();
jest.mock('../services', () => ({
    versionService: { checkForUpdate: (...args: unknown[]) => mockCheckForUpdate(...args) },
}));

// getVersionCheckResult/onVersionCheckComplete share a module-level singleton cache that is only
// ever populated (never cleared) once an update is found — mirroring production, where a found
// update stays "sticky" for the rest of the app session. Tests that must observe an empty cache
// run BEFORE the "update found" test, which intentionally runs last.
describe('useAppVersionCheck', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('checkOnMount가 false면 versionService를 호출하지 않는다', () => {
        renderHook(() => useAppVersionCheck(false));

        expect(mockCheckForUpdate).not.toHaveBeenCalled();
    });

    it('업데이트가 없으면 hasUpdate는 false로 유지되고 캐시도 비어있다', async () => {
        mockCheckForUpdate.mockResolvedValue({
            platform: 'ios',
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
            updateAvailable: false,
            storeUrl: 'https://apps.apple.com/app/id6758658673',
        });

        const { result } = renderHook(() => useAppVersionCheck(true));
        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.hasUpdate).toBe(false);
        expect(getVersionCheckResult()).toBeNull();
    });

    it('showUpdateAlert는 네이티브 Alert를 노출하고, 업데이트 선택 시 스토어 URL을 연다', () => {
        const { result } = renderHook(() => useAppVersionCheck(false));

        act(() => {
            result.current.showUpdateAlert();
        });

        expect(Alert.alert).toHaveBeenCalledTimes(1);
        const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
        buttons[1].onPress();
        expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id6758658673');
    });

    it('업데이트가 있으면 hasUpdate를 true로 바꾸고 싱글턴 캐시/리스너에 반영한다', async () => {
        mockCheckForUpdate.mockResolvedValue({
            platform: 'ios',
            currentVersion: '1.0.0',
            latestVersion: '9.9.9',
            updateAvailable: true,
            storeUrl: 'https://apps.apple.com/app/id6758658673',
        });
        const listener = jest.fn();
        onVersionCheckComplete(listener);

        const { result } = renderHook(() => useAppVersionCheck(true));
        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.hasUpdate).toBe(true);
        expect(getVersionCheckResult()).toEqual({ hasUpdate: true, latestVersion: '9.9.9' });
        expect(listener).toHaveBeenCalledWith({ hasUpdate: true, latestVersion: '9.9.9' });
    });
});
