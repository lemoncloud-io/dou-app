/**
 * `hooks/useRelaySessionGuard.spec.ts`
 *
 * The probe/refresh BODY moved to `@chatic/app-runtime`'s `useSessionStalenessGuard`
 * (ADR-0070 3단계 체크리스트 7), and is covered by that hook's own tests — offline skip, the
 * consecutive-failure counting, the streak reset, exceptions not counting as failures.
 *
 * What is admin-v2's and therefore tested here is the POLICY: this console polls on an interval and
 * on tab focus, treats a missing session as a definitive failure, and tears the session down after
 * three consecutive failures. Those four choices are what separate it from apps/web's guard, so they
 * are what a regression here would break.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/app-runtime', () => ({
    useSessionStalenessGuard: vi.fn(() => ({ check: vi.fn() })),
    logoutRelaySession: vi.fn(),
}));

import { logoutRelaySession, useSessionStalenessGuard } from '@chatic/app-runtime';

import { useRelaySessionGuard } from './useRelaySessionGuard';

const mockGuard = useSessionStalenessGuard as ReturnType<typeof vi.fn>;

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

    it('세션 부재를 확정 실패로 센다 — 콘솔은 로그인 없이 돌 수 없다', () => {
        expect(policyFor(true).missingSessionCountsAsFailure).toBe(true);
    });

    it('연속 3회 실패에서만 teardown한다 — blip 한 번으로 로그아웃시키지 않는다', () => {
        expect(policyFor(true).consecutiveFailureLimit).toBe(3);
    });

    it('teardown은 relay 세션을 내려 /auth/login으로 보낸다', async () => {
        const policy = policyFor(true);

        await policy.onTeardown?.();

        expect(logoutRelaySession).toHaveBeenCalled();
    });

    it('enabled를 그대로 전달한다 — 로그인 전에는 감시하지 않는다', () => {
        expect(policyFor(false).enabled).toBe(false);
        expect(policyFor(true).enabled).toBe(true);
    });
});
