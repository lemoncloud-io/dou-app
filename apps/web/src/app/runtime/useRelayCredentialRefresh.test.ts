import { renderHook } from '@testing-library/react';

let relayVerified = false;

const mockGuard = jest.fn((_options: Record<string, unknown>) => ({ check: mockCheck }));
const mockCheck = jest.fn();

jest.mock('@chatic/runtime', () => ({
    runtime: {
        session: {
            useSessionStalenessGuard: (options: Record<string, unknown>) => mockGuard(options),
        },
        connection: {
            RELAY_SLOT: 'default',
            useSlotVerified: () => relayVerified,
        },
    },
}));

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
    return mockGuard.mock.calls[0][0];
};

beforeEach(() => {
    relayVerified = false;
});

describe('useRelayCredentialRefresh — apps/web 정책', () => {
    it('주기 폴링을 쓰지 않고 relay 검증 상승 엣지로만 검사한다', () => {
        const policy = render();

        expect(policy).toMatchObject({ intervalMs: null, checkOnRelayVerified: true });
    });

    it('만료 여부와 무관하게 선제 refresh를 요청한다 (부팅/포그라운드 갱신)', () => {
        const policy = render();

        expect(policy.forceRefresh).toBe(true);
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
