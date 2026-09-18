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
    runtime: {
        session: {
            useSessionStalenessGuard: (...args: unknown[]) => mockGuard(...(args as [])),
        },
        connection: {
            useKindVerified: (...args: unknown[]) => mockKindVerified(...(args as [])),
        },
    },
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
        // Polling can't reach the refresh owner before the socket comes up — it would just pile up failures
        expect(render()).toMatchObject({ intervalMs: null, checkOnRelayVerified: true });
    });

    it('가시성 복귀에서도 검사한다 — 서스펜션을 견딘 소켓은 상승 엣지가 없다', () => {
        // The same edge this shell has, corresponding to apps/web's WebView foreground trigger.
        // It goes through the gate below rather than the hub's built-in listener, so the option itself is off.
        render();
        expect(mockGuard.mock.calls[0][0]).toMatchObject({ checkOnVisible: false });

        emitVisibility('visible');

        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    // Without a socket, check can't reach the refresh owner and just leaves a warning — waking from sleep is exactly that state.
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

    // Boot's `auth.update` doesn't carry a token, so without this the first writeback would be one
    // SDK refresh cycle (5 min) away — until then relay-signed HTTP is signed with pre-sleep credentials and gets a 403.
    it('만료 여부와 무관하게 선제 refresh를 요청한다', () => {
        expect(render().forceRefresh).toBe(true);
    });

    it('절대 teardown하지 않는다 — desktop-web의 relay 로그아웃은 수동 전용이다', () => {
        const policy = render();

        expect(policy.consecutiveFailureLimit).toBeNull();
        expect(policy.onTeardown).toBeUndefined();
    });
});
