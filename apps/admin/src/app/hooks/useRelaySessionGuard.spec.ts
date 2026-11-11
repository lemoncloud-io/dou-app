/**
 * `hooks/useRelaySessionGuard.spec.ts`
 *
 * The probe/refresh BODY is runtime-core's `RelayCredentialGuard` (reached through
 * `runtime.session.useSessionStalenessGuard`) and is covered by its own tests — offline skip, the
 * preemptive floor, and why a failed refresh is only logged.
 *
 * What is admin's and therefore tested here is the POLICY. The guard refreshes and never ends a
 * session — it no longer has a teardown option at all: that was a second, speculative logout engine
 * ("the refresh did not run" is a statement about the socket, not the session), and the server's own
 * verdict (`authFailureReaction`) is the one that ends sessions.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionStalenessGuard: vi.fn(() => ({ check: vi.fn() })),
            logoutSession: vi.fn(),
        },
    },
}));

import { runtime } from '@chatic/app-runtime';

import { useRelaySessionGuard } from './useRelaySessionGuard';

const mockGuard = runtime.session.useSessionStalenessGuard as ReturnType<typeof vi.fn>;

const policyFor = (enabled: boolean) => {
    mockGuard.mockClear();
    renderHook(() => useRelaySessionGuard(enabled));
    return mockGuard.mock.calls[0][0];
};

describe('useRelaySessionGuard — admin 정책', () => {
    it('30초 주기 + 탭 포커스에서 검사한다 (슬립 복귀가 주된 만료 시점)', () => {
        const policy = policyFor(true);

        expect(policy).toMatchObject({ intervalMs: 30_000, checkOnVisible: true });
    });

    it('relay 검증 상승 에지에서도 검사한다 — refresh가 가능해지는 바로 그 순간이다', () => {
        expect(policyFor(true).checkOnRelayVerified).toBe(true);
    });

    it('로그아웃을 부르지 않는다 — 정책 어디에도 logoutSession이 없다', () => {
        policyFor(true);

        expect(runtime.session.logoutSession).not.toHaveBeenCalled();
    });

    it('enabled를 그대로 전달한다 — 로그인 전에는 감시하지 않는다', () => {
        expect(policyFor(false).enabled).toBe(false);
        expect(policyFor(true).enabled).toBe(true);
    });
});
