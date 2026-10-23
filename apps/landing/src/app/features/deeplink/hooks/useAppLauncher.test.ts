import { StrictMode } from 'react';

import { act, renderHook } from '@testing-library/react';

import { APP_CONFIG, DEEPLINK_CONFIG } from '../consts';
import { openUrl } from '../utils';

import type * as Utils from '../utils';

import { useAppLauncher } from './useAppLauncher';

vi.mock('../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    openUrl: vi.fn(),
}));

const openUrlMock = vi.mocked(openUrl);

const deepLinkInfo = {
    fullPath: '/i?t=token',
    deepLinkUrl: 'http://localhost:3000/i?t=token',
};

const setVisibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useAppLauncher', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        openUrlMock.mockClear();
        setVisibility('visible');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('tries the app on mount when auto launch is on, falling back to this page marked as missing', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'android', deepLinkInfo, autoLaunch: true }));

        expect(openUrlMock).toHaveBeenCalledTimes(1);
        const launched = openUrlMock.mock.calls[0][0];
        expect(launched.startsWith('intent://i?t=token#Intent;')).toBe(true);
        expect(launched).toContain(
            `S.browser_fallback_url=${encodeURIComponent(`${window.location.origin}/i?t=token#app-missing`)}`
        );
        expect(result.current.state).toBe('launching');
    });

    it('launches only once even when re-rendered', () => {
        const { rerender } = renderHook(() =>
            useAppLauncher({ deviceType: 'android', deepLinkInfo, autoLaunch: true })
        );

        rerender();

        expect(openUrlMock).toHaveBeenCalledTimes(1);
    });

    it('waits for a tap when auto launch is off', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'ios', deepLinkInfo, autoLaunch: false }));

        expect(openUrlMock).not.toHaveBeenCalled();
        expect(result.current.state).toBe('initial');
    });

    it('offers the store when the page is still showing after the timeout', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'ios', deepLinkInfo, autoLaunch: true }));

        act(() => {
            vi.advanceTimersByTime(DEEPLINK_CONFIG.launchTimeout);
        });

        expect(result.current.state).toBe('initial');
        expect(result.current.dialogType).toBe('store-confirm');
    });

    it('still offers the store under StrictMode, whose remount does not launch again', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'android', deepLinkInfo, autoLaunch: true }), {
            wrapper: StrictMode,
        });

        act(() => {
            // What Chrome's intent fallback does when the package is missing.
            window.location.hash = 'app-missing';
            vi.advanceTimersByTime(DEEPLINK_CONFIG.launchTimeout);
        });
        window.location.hash = '';

        expect(openUrlMock).toHaveBeenCalledTimes(1);
        expect(result.current.dialogType).toBe('store-confirm');
    });

    it('does not offer the store on Android when the page is still showing but the fallback never came', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'android', deepLinkInfo, autoLaunch: true }));

        act(() => {
            vi.advanceTimersByTime(DEEPLINK_CONFIG.launchTimeout);
        });

        expect(result.current.state).toBe('initial');
        expect(result.current.dialogType).toBeNull();
    });

    it('does not offer the store once the page went to the background for the app', () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'ios', deepLinkInfo, autoLaunch: true }));

        act(() => {
            setVisibility('hidden');
            vi.advanceTimersByTime(DEEPLINK_CONFIG.launchTimeout);
        });

        expect(result.current.state).toBe('initial');
        expect(result.current.dialogType).toBeNull();
    });

    it('sends a tapped launch on Android to the store when the app is missing', async () => {
        const { result } = renderHook(() => useAppLauncher({ deviceType: 'android', deepLinkInfo, autoLaunch: false }));

        await act(() => result.current.confirmLaunchApp());

        expect(openUrlMock.mock.calls[0][0]).toContain(
            `S.browser_fallback_url=${encodeURIComponent(APP_CONFIG.storeUrls.android)}`
        );
    });
});
