import { renderHook } from '@testing-library/react';

/**
 * The probe/refresh BODY moved to `@chatic/app-runtime`'s `useSessionStalenessGuard`
 * (ADR-0070 3단계 체크리스트 7), and its own tests cover the offline skip, the "fresh → do nothing"
 * path, the missing-session path, and the failure counting.
 *
 * What is apps/web's — and therefore what a regression here would break — is the POLICY: edge-driven
 * rather than polled, gated on relay verification, and never tearing the session down.
 */
let relayVerified = false;

const mockGuard = jest.fn(() => ({ check: mockCheck }));
const mockCheck = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    useSessionStalenessGuard: (...args: unknown[]) => mockGuard(...(args as [])),
    useKindVerified: () => relayVerified,
}));

// Capture the foreground handler instead of simulating the bridge/visibility sources — those merge
// rules are useAppVisibility/useAppForeground's own tested contract.
const foregroundHandlers: Array<() => void> = [];
jest.mock('../bridge', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandlers.push(handler);
    },
}));

import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

const render = () => {
    foregroundHandlers.length = 0;
    mockGuard.mockClear();
    mockCheck.mockClear();
    renderHook(() => useRelayCredentialRefresh());
    return mockGuard.mock.calls[0][0] as Record<string, unknown>;
};

beforeEach(() => {
    relayVerified = false;
});

describe('useRelayCredentialRefresh — apps/web 정책', () => {
    it('주기 폴링을 쓰지 않고 relay 검증 상승 엣지로만 검사한다', () => {
        const policy = render();

        // 폴링은 소켓이 뜨기 전에는 refresh 소유자에 닿지 못해 실패만 쌓는다
        expect(policy).toMatchObject({ intervalMs: null, checkOnRelayVerified: true });
    });

    // Boot's `auth.update` emits no token, so without this the first writeback is one SDK refresh
    // cycle (5분) away and relay-signed HTTP runs on the pre-sleep credential until then.
    it('만료 여부와 무관하게 선제 refresh를 요청한다 (부팅/포그라운드 갱신)', () => {
        const policy = render();

        expect(policy.forceRefresh).toBe(true);
    });

    it('절대 teardown하지 않는다 — apps/web의 relay 로그아웃은 수동 전용이다', () => {
        const policy = render();

        expect(policy.consecutiveFailureLimit).toBeNull();
        expect(policy.onTeardown).toBeUndefined();
    });

    it('포그라운드 복귀에서도 검사한다 — 서스펜션을 견딘 소켓은 상승 엣지가 없다', () => {
        relayVerified = true;
        render();

        foregroundHandlers.forEach(h => h());

        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    it('소켓이 미검증이면 포그라운드 복귀에서 검사하지 않는다 (엣지가 이후에 처리한다)', () => {
        relayVerified = false;
        render();

        foregroundHandlers.forEach(h => h());

        expect(mockCheck).not.toHaveBeenCalled();
    });
});
