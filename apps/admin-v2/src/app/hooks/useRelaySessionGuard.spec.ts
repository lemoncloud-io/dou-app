/**
 * `hooks/useRelaySessionGuard.spec.ts`
 *
 * The probe/refresh BODY lives in `@chatic/app-runtime`'s `runtime.session.useSessionStalenessGuard`
 * and is covered by that hook's own tests — offline skip, the failure counting, the streak reset,
 * and which failures are definitive at all.
 *
 * What is admin-v2's and therefore tested here is the POLICY, and the load-bearing half of it is
 * now a NEGATIVE: this guard refreshes and never ends a session. The teardown it used to carry was
 * a second, speculative logout engine — "the refresh did not run" is a statement about the socket,
 * not the session — and the server's own verdict (`authFailureReaction`) is the one that ends
 * sessions. A regression that re-adds `onTeardown` here brings the wake-from-sleep logouts back,
 * so it is asserted explicitly rather than left to the absence of a test.
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

describe('useRelaySessionGuard — admin-v2 정책', () => {
    it('30초 주기 + 탭 포커스에서 검사한다 (슬립 복귀가 주된 만료 시점)', () => {
        const policy = policyFor(true);

        expect(policy).toMatchObject({ intervalMs: 30_000, checkOnVisible: true });
    });

    it('relay 검증 상승 에지에서도 검사한다 — refresh가 가능해지는 바로 그 순간이다', () => {
        expect(policyFor(true).checkOnRelayVerified).toBe(true);
    });

    it('teardown하지 않는다 — 세션 종료는 서버의 판정이지 이 프로브의 실패가 아니다', () => {
        const policy = policyFor(true);

        expect(policy.onTeardown).toBeUndefined();
        expect(policy.consecutiveFailureLimit).toBeUndefined();
        expect(policy.missingSessionCountsAsFailure).toBeUndefined();
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
