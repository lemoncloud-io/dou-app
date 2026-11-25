import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const mockCheck = vi.fn();
const mockGuard = vi.fn(() => ({ check: mockCheck }));
const mockSlotVerified = vi.fn(() => true);

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        session: {
            useSessionStalenessGuard: (...args: unknown[]) => mockGuard(...(args as [])),
        },
        connection: {
            RELAY_SLOT: 'default',
            useSlotVerified: (...args: unknown[]) => mockSlotVerified(...(args as [])),
        },
    })
);

import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

const render = () => {
    renderHook(() => useRelayCredentialRefresh());
    return mockGuard.mock.calls[0][0] as unknown as Record<string, unknown>;
};

const emitVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
    vi.clearAllMocks();
    mockSlotVerified.mockReturnValue(true);
});

describe('useRelayCredentialRefresh — desktop-web 정책', () => {
    it('주기 폴링을 쓰지 않고 relay 검증 상승 엣지로 검사한다', () => {
        expect(render()).toMatchObject({ intervalMs: null, checkOnRelayVerified: true });
    });

    it('가시성 복귀에서도 검사한다 — 서스펜션을 견딘 소켓은 상승 엣지가 없다', () => {
        render();
        expect(mockGuard.mock.calls[0][0]).toMatchObject({ checkOnVisible: false });

        emitVisibility('visible');

        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    it('소켓이 검증되지 않았으면 가시성 복귀에 검사하지 않는다', () => {
        mockSlotVerified.mockReturnValue(false);
        render();

        emitVisibility('visible');

        expect(mockCheck).not.toHaveBeenCalled();
    });

    it('숨김 전환에는 검사하지 않는다', () => {
        render();

        emitVisibility('hidden');

        expect(mockCheck).not.toHaveBeenCalled();
    });

    it('만료 여부와 무관하게 선제 refresh를 요청한다', () => {
        expect(render().forceRefresh).toBe(true);
    });
});
