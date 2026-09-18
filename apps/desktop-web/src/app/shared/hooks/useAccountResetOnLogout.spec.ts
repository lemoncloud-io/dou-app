import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

import { useAccountResetOnLogout } from './useAccountResetOnLogout';

// Only need to observe cacheClear on the 7 repos — the runtime data layer is stubbed.
const repos = Object.fromEntries(
    ['channel', 'chat', 'cloud', 'join', 'profile', 'place', 'user'].map(name => [
        name,
        { cacheClear: vi.fn().mockResolvedValue(undefined) },
    ])
);
vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => repos } },
}));

// Verify via the Facade's clear, not the registry: this is the one method that sweeps both the
// lane entry (in-memory) and the persisted `@chatic/config.ui.*` key in one go.
const clearConfigKey = vi.fn().mockReturnValue({ ok: true });
vi.mock('@chatic/config', () => ({ config: { clear: (...args: unknown[]) => clearConfigKey(...args) } }));

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe('useAccountResetOnLogout', () => {
    it('ui.pinnedChannels와 ui.channelOrder를 local 레인에서 지운다 — 인메모리 + persist 함께', async () => {
        const { result } = renderHook(() => useAccountResetOnLogout());

        await result.current.resetAccount();

        expect(clearConfigKey).toHaveBeenCalledWith('ui.pinnedChannels', { lane: 'local' });
        expect(clearConfigKey).toHaveBeenCalledWith('ui.channelOrder', { lane: 'local' });
    });

    it('마이그레이션 전일 수 있는 레거시 즐겨찾기 키도 지운다 — 다음 계정 누수 방지', async () => {
        localStorage.setItem(
            'chatic-favorite-channels',
            JSON.stringify({ state: { ids: { 'ch-1': true } }, version: 0 })
        );
        const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

        const { result } = renderHook(() => useAccountResetOnLogout());
        await result.current.resetAccount();

        expect(removeItemSpy).toHaveBeenCalledWith('chatic-favorite-channels');
        removeItemSpy.mockRestore();
    });

    it('7개 repo 캐시를 비운다 — 로그아웃 위생은 그대로 유지된다', async () => {
        const { result } = renderHook(() => useAccountResetOnLogout());

        await result.current.resetAccount();
        await waitFor(() => {
            for (const repo of Object.values(repos)) expect(repo.cacheClear).toHaveBeenCalled();
        });
    });
});
