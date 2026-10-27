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

        // The rail can list invited clouds from nowhere but these two records, and no logout takes the
        // grants with it: a signed-in account falls back to the device's guest, and a guest that logs
        // out is registered back into by the same device id. Wiping them emptied the list until a push
        // re-cached one cloud.
        it.each([
            ['a social account', { userRole: 'user' }],
            ['a guest', { userRole: 'guest' }],
            ['a device with no relay user', null],
        ])('keeps the invited clouds in the list after %s logs out', async (_label, relay) => {
            relayUser.current = relay;
            const { result } = renderHook(() => useAccountResetOnLogout());
            await result.current.resetAccount();

            expect(rows.map(row => row.id)).toEqual([invited.id]);
            expect(localStorage.getItem('chatic-joined-clouds')).not.toBeNull();
        });
    });

    // The cloud cache is swept row by row instead (the invited-clouds cases above).
    it('clears every other data cache on logout', async () => {
        const { result } = renderHook(() => useAccountResetOnLogout());

        await result.current.resetAccount();
        await waitFor(() => {
            for (const [name, repo] of Object.entries(repos)) {
                if (name !== 'cloud') expect(repo.cacheClear).toHaveBeenCalled();
            }
        });
    });
});
