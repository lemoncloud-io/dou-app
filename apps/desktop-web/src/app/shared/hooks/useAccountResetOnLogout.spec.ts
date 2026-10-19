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
// The account's role, from the relay token — what decides whether invited clouds stay.
const relayUser = vi.hoisted(() => ({ current: null as { userRole: string } | null }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repos },
        session: { getRelaySessionUser: () => relayUser.current },
    },
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

    it('clears the rail order, which names the clouds and places of the account leaving', async () => {
        const { result } = renderHook(() => useAccountResetOnLogout());

        await result.current.resetAccount();

        expect(clearConfigKey).toHaveBeenCalledWith('ui.railOrder', { lane: 'local' });
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

    it("clears the device-local thread list — the next account must not see this one's threads", async () => {
        const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

        const { result } = renderHook(() => useAccountResetOnLogout());
        await result.current.resetAccount();

        expect(removeItemSpy).toHaveBeenCalledWith('chatic-my-threads');
        removeItemSpy.mockRestore();
    });

    describe('invited clouds', () => {
        const invited = { id: 'cloud-invited', name: 'Friends', cloudType: 'invited' };
        const owned = { id: 'cloud-owned', name: 'Studio', cloudType: 'owner' };
        let rows: Array<Record<string, unknown>> = [];
        const cloudRepo = repos.cloud as Record<string, ReturnType<typeof vi.fn>>;

        // A stand-in cloud cache, so the test reads what is left rather than which calls were made.
        beforeEach(() => {
            rows = [invited, owned];
            cloudRepo.cacheClear.mockImplementation(async () => {
                rows = [];
            });
            cloudRepo.cacheReadList = vi.fn(async () => ({ list: rows }));
            cloudRepo.cacheDelete = vi.fn(async (id: string) => {
                rows = rows.filter(row => row.id !== id);
            });
            localStorage.setItem(
                'chatic-joined-clouds',
                JSON.stringify({ state: { joinedClouds: { [invited.id]: invited } }, version: 0 })
            );
        });

        // A signed-in account on desktop is the device's guest linked to a provider. The guest it falls
        // back to still holds the invite grants, and the rail can list invited clouds from nowhere but
        // these two records — wiping them emptied the list until a push re-cached one cloud.
        it('keeps the invited clouds in the list after a social account logs out', async () => {
            relayUser.current = { userRole: 'user' };
            const { result } = renderHook(() => useAccountResetOnLogout());
            await result.current.resetAccount();

            expect(rows.map(row => row.id)).toEqual([invited.id]);
            expect(localStorage.getItem('chatic-joined-clouds')).not.toBeNull();
        });

        // Inside a cloud the active session is the cloud user's, which is no guest even for a guest
        // account; the relay role is the one that says the logout is a delete.
        it.each([
            ['a guest, whose logout is a delete', { userRole: 'guest' }],
            ['a device with no relay user', null],
        ])('takes the invited clouds with %s', async (_label, relay) => {
            relayUser.current = relay;
            const { result } = renderHook(() => useAccountResetOnLogout());
            await result.current.resetAccount();

            expect(rows).toEqual([]);
            expect(localStorage.getItem('chatic-joined-clouds')).toBeNull();
        });
    });

    it('7개 repo 캐시를 비운다 — 로그아웃 위생은 그대로 유지된다', async () => {
        const { result } = renderHook(() => useAccountResetOnLogout());

        await result.current.resetAccount();
        await waitFor(() => {
            for (const repo of Object.values(repos)) expect(repo.cacheClear).toHaveBeenCalled();
        });
    });
});
