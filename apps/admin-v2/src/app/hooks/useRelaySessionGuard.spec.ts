/**
 * `hooks/useRelaySessionGuard.spec.ts`
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/web-core', () => ({
    webTransport: { isAuthenticated: vi.fn() },
    logoutRelaySession: vi.fn(),
}));

import { logoutRelaySession, webTransport } from '@chatic/web-core';

import { useRelaySessionGuard } from './useRelaySessionGuard';

const mockIsAuthenticated = webTransport.isAuthenticated as ReturnType<typeof vi.fn>;
const mockLogout = logoutRelaySession as ReturnType<typeof vi.fn>;

const setOnline = (online: boolean) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
};

const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useRelaySessionGuard — 만료된 relay 세션 정리', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockIsAuthenticated.mockReset().mockResolvedValue(true);
        mockLogout.mockReset().mockResolvedValue(undefined);
        setOnline(true);
        setVisibility('visible');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('disabled면 인터벌이 지나도 아무것도 확인하지 않는다', async () => {
        renderHook(() => useRelaySessionGuard(false));

        await vi.advanceTimersByTimeAsync(60_000);

        expect(mockIsAuthenticated).not.toHaveBeenCalled();
    });

    it('30초마다 확인하고, 살아있으면 로그아웃하지 않는다', async () => {
        renderHook(() => useRelaySessionGuard(true));

        await vi.advanceTimersByTimeAsync(30_000);

        expect(mockIsAuthenticated).toHaveBeenCalledTimes(1);
        expect(mockLogout).not.toHaveBeenCalled();
    });

    it('refresh가 최종 실패하면(zombie 세션) 로그아웃시킨다', async () => {
        mockIsAuthenticated.mockResolvedValue(false);
        renderHook(() => useRelaySessionGuard(true));

        await vi.advanceTimersByTimeAsync(30_000);

        expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('오프라인이면 확인 자체를 건너뛴다(끊긴 네트워크로 로그아웃시키지 않음)', async () => {
        setOnline(false);
        renderHook(() => useRelaySessionGuard(true));

        await vi.advanceTimersByTimeAsync(30_000);

        expect(mockIsAuthenticated).not.toHaveBeenCalled();
        expect(mockLogout).not.toHaveBeenCalled();
    });

    it('탭이 다시 보이면 인터벌을 기다리지 않고 즉시 확인한다', async () => {
        renderHook(() => useRelaySessionGuard(true));

        setVisibility('hidden');
        setVisibility('visible');
        await vi.advanceTimersByTimeAsync(0);

        expect(mockIsAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('언마운트 후에는 더 이상 확인하지 않는다', async () => {
        const { unmount } = renderHook(() => useRelaySessionGuard(true));
        unmount();

        await vi.advanceTimersByTimeAsync(60_000);
        setVisibility('visible');

        expect(mockIsAuthenticated).not.toHaveBeenCalled();
    });
});
