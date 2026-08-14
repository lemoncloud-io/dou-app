import { renderHook } from '@testing-library/react';

let relayVerified = false;

jest.mock('@chatic/app-runtime', () => ({
    requestSessionRefresh: jest.fn().mockResolvedValue(true),
    useKindVerified: () => relayVerified,
}));

jest.mock('@chatic/web-core', () => ({
    hasStoredRelaySession: jest.fn().mockResolvedValue(true),
    isStoredSessionExpired: jest.fn().mockResolvedValue(true),
}));

jest.mock('@chatic/bridges', () => ({
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

// Capture the foreground handler instead of simulating the bridge/visibility sources — those merge
// rules are useAppVisibility/useAppForeground's own tested contract.
const foregroundHandlers: Array<() => void> = [];
jest.mock('../bridge', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandlers.push(handler);
    },
}));

import { requestSessionRefresh } from '@chatic/app-runtime';
import { hasStoredRelaySession, isStoredSessionExpired } from '@chatic/web-core';

import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

const mockRequestRefresh = requestSessionRefresh as jest.Mock;
const mockHasSession = hasStoredRelaySession as jest.Mock;
const mockIsExpired = isStoredSessionExpired as jest.Mock;

// `useAppForeground` re-registers on every render, so only the latest closure is the live one.
const emitForeground = () => foregroundHandlers[foregroundHandlers.length - 1]?.();

// The hook's effect body is async, so every assertion runs after the pending microtasks drain.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useRelayCredentialRefresh — 만료된 relay 자격증명 재발급', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        foregroundHandlers.length = 0;
        relayVerified = false;
        mockRequestRefresh.mockResolvedValue(true);
        mockHasSession.mockResolvedValue(true);
        mockIsExpired.mockResolvedValue(true);
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('relay 소켓이 아직 미검증이면 아무것도 하지 않는다 (부팅 HTTP 리프레시 금지)', async () => {
        renderHook(() => useRelayCredentialRefresh());
        await flush();

        expect(mockHasSession).not.toHaveBeenCalled();
        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('relay 검증 상승 엣지에서 stale하면 리프레시를 요청한다', async () => {
        const { rerender } = renderHook(() => useRelayCredentialRefresh());

        relayVerified = true;
        rerender();
        await flush();

        expect(mockRequestRefresh).toHaveBeenCalledWith('relay');
    });

    it('검증 상태가 유지되는 재렌더에서는 다시 쏘지 않는다', async () => {
        const { rerender } = renderHook(() => useRelayCredentialRefresh());

        relayVerified = true;
        rerender();
        await flush();
        rerender();
        await flush();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('자격증명이 아직 신선하면 리프레시하지 않는다', async () => {
        mockIsExpired.mockResolvedValue(false);

        const { rerender } = renderHook(() => useRelayCredentialRefresh());
        relayVerified = true;
        rerender();
        await flush();

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('저장된 세션이 없으면(로그아웃/첫 방문) 아무것도 하지 않는다', async () => {
        mockHasSession.mockResolvedValue(false);

        const { rerender } = renderHook(() => useRelayCredentialRefresh());
        relayVerified = true;
        rerender();
        await flush();

        expect(mockIsExpired).not.toHaveBeenCalled();
        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('오프라인이면 프로브조차 하지 않는다', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        const { rerender } = renderHook(() => useRelayCredentialRefresh());
        relayVerified = true;
        rerender();
        await flush();

        expect(mockHasSession).not.toHaveBeenCalled();
        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('검증된 소켓으로 포그라운드 복귀하면 다시 확인한다', async () => {
        relayVerified = true;
        renderHook(() => useRelayCredentialRefresh());
        await flush();
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);

        emitForeground();
        await flush();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(2);
    });

    it('소켓이 죽은 채 포그라운드로 오면 건너뛴다 (검증 엣지가 맡는다)', async () => {
        renderHook(() => useRelayCredentialRefresh());
        await flush();

        emitForeground();
        await flush();

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('진행 중인 확인이 있으면 겹쳐 실행하지 않는다', async () => {
        let release: (value: boolean) => void = () => undefined;
        mockRequestRefresh.mockReturnValue(
            new Promise<boolean>(resolve => {
                release = resolve;
            })
        );

        relayVerified = true;
        renderHook(() => useRelayCredentialRefresh());
        await flush();

        emitForeground();
        emitForeground();
        await flush();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
        release(true);
    });

    it('리프레시가 실패해도 throw하지 않는다 (로그아웃은 수동 전용)', async () => {
        mockRequestRefresh.mockResolvedValue(false);

        relayVerified = true;
        renderHook(() => useRelayCredentialRefresh());
        await expect(flush()).resolves.toBeUndefined();
    });
});
