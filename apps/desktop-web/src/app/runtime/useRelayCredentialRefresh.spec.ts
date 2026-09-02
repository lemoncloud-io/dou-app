import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

/**
 * The probe/refresh BODY belongs to `@chatic/app-runtime`'s `useSessionStalenessGuard`, and its own
 * tests cover the offline skip, the "fresh → do nothing" path, the missing-session path and the
 * failure counting.
 *
 * What is desktop-web's — and therefore what a regression here would break — is the POLICY: edge
 * driven rather than polled, on both edges this shell has (relay verification, visibility return),
 * preemptive, and never tearing the session down.
 */
const mockCheck = vi.fn();
const mockGuard = vi.fn(() => ({ check: mockCheck }));
const mockKindVerified = vi.fn(() => true);

vi.mock('@chatic/app-runtime', () => ({
    useSessionStalenessGuard: (...args: unknown[]) => mockGuard(...(args as [])),
    useKindVerified: (...args: unknown[]) => mockKindVerified(...(args as [])),
}));

import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

const render = () => {
    renderHook(() => useRelayCredentialRefresh());
    return mockGuard.mock.calls[0][0] as unknown as Record<string, unknown>;
};

/** Fires a real visibilitychange with `document.visibilityState` forced to `state`. */
const emitVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
    vi.clearAllMocks();
    mockKindVerified.mockReturnValue(true);
});

describe('useRelayCredentialRefresh — desktop-web 정책', () => {
    it('주기 폴링을 쓰지 않고 relay 검증 상승 엣지로 검사한다', () => {
        // 폴링은 소켓이 뜨기 전에는 refresh 소유자에 닿지 못해 실패만 쌓는다
        expect(render()).toMatchObject({ intervalMs: null, checkOnRelayVerified: true });
    });

    it('가시성 복귀에서도 검사한다 — 서스펜션을 견딘 소켓은 상승 엣지가 없다', () => {
        // apps/web의 WebView 포그라운드 트리거에 해당하는, 이 셸이 가진 같은 엣지.
        // 허브 내장 리스너가 아니라 아래 게이트를 거치므로 옵션 자체는 꺼져 있다.
        render();
        expect(mockGuard.mock.calls[0][0]).toMatchObject({ checkOnVisible: false });

        emitVisibility('visible');

        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    // 소켓이 없으면 check는 refresh 소유자에 닿지 못하고 warn만 남긴다 — 절전 복귀는 바로 그 상태다.
    it('소켓이 검증되지 않았으면 가시성 복귀에 검사하지 않는다', () => {
        mockKindVerified.mockReturnValue(false);
        render();

        emitVisibility('visible');

        expect(mockCheck).not.toHaveBeenCalled();
    });

    it('숨김 전환에는 검사하지 않는다', () => {
        render();

        emitVisibility('hidden');

        expect(mockCheck).not.toHaveBeenCalled();
    });

    // 부팅의 `auth.update`는 토큰을 싣지 않으므로, 이게 없으면 첫 writeback은 SDK refresh 한 주기
    // (5분) 뒤다 — 그때까지 relay 서명 HTTP는 잠들기 전 자격증명으로 서명되어 403이 난다.
    it('만료 여부와 무관하게 선제 refresh를 요청한다', () => {
        expect(render().forceRefresh).toBe(true);
    });

    it('절대 teardown하지 않는다 — desktop-web의 relay 로그아웃은 수동 전용이다', () => {
        const policy = render();

        expect(policy.consecutiveFailureLimit).toBeNull();
        expect(policy.onTeardown).toBeUndefined();
    });
});
