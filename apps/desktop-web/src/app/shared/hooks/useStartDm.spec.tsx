import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

let activeCloudId = 'cloud-1';
let selectedSiteId: string | null = 'site-1';
const startDm = vi.fn();
const getSelfChannel = vi.fn();
const toast = vi.fn();
const syncChannels = vi.fn();
const syncMeta = { getSyncedAt: vi.fn(), setSyncedAt: vi.fn() };
const warn = vi.fn();
const repositories = { channel: { startDm, getSelfChannel, syncChannels }, syncMeta };

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: {
            useGlobalSession: () => ({ cloud: { cloudId: activeCloudId } }),
            useSessionSelection: () => ({ selectedSiteId }),
        },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: (...args: unknown[]) => warn(...args) } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { usePendingOpenStore } from '../stores';
import { useStartDm } from './useStartDm';

describe('useStartDm', () => {
    beforeEach(() => {
        activeCloudId = 'cloud-1';
        selectedSiteId = 'site-1';
        startDm.mockReset();
        getSelfChannel.mockReset();
        toast.mockReset();
        usePendingOpenStore.setState({ target: null });
        syncChannels.mockReset().mockResolvedValue({ syncedAt: 200 });
        syncMeta.getSyncedAt.mockReset().mockResolvedValue(100);
        syncMeta.setSyncedAt.mockReset().mockResolvedValue(undefined);
        warn.mockReset();
    });

    it('pulls the channel delta right away for a room the call just created', async () => {
        // A new room comes back without a place, so it is not cached until a channel sync.
        startDm.mockResolvedValue({ id: 'dm-1', stereo: 'dm' });
        const { result } = renderHook(() => useStartDm());

        await act(async () => {
            await result.current.startDm('u-1');
        });

        expect(syncMeta.getSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-1');
        expect(syncChannels).toHaveBeenCalledWith(100);
        expect(syncMeta.setSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-1', 200);
    });

    it('skips the sync for a room that is already cached', async () => {
        startDm.mockResolvedValue({ id: 'dm-1', stereo: 'dm', sid: 'site-1' });
        const { result } = renderHook(() => useStartDm());

        await act(async () => {
            await result.current.startDm('u-1');
        });

        expect(syncChannels).not.toHaveBeenCalled();
    });

    it('still opens the room when the follow-up sync fails', async () => {
        startDm.mockResolvedValue({ id: 'dm-1', stereo: 'dm' });
        syncChannels.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useStartDm());

        let room: unknown;
        await act(async () => {
            room = await result.current.startDm('u-1');
        });

        expect(room).toEqual({ id: 'dm-1', stereo: 'dm' });
        expect(warn).toHaveBeenCalled();
        expect(syncMeta.setSyncedAt).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('opens the room the server returns, without switching place', async () => {
        startDm.mockResolvedValue({ id: 'dm-1', stereo: 'dm' });
        const { result } = renderHook(() => useStartDm());

        let room: unknown;
        await act(async () => {
            room = await result.current.startDm('u-1');
        });

        expect(startDm).toHaveBeenCalledWith({ peerId: 'u-1' });
        expect(room).toEqual({ id: 'dm-1', stereo: 'dm' });
        // An empty place is "stay where you are": the peer was picked from this place's list.
        expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: '', channelId: 'dm-1' });
    });

    it('calls the server once for a double click', async () => {
        let resolve: (room: unknown) => void = () => undefined;
        startDm.mockReturnValue(new Promise(r => (resolve = r)));
        const { result } = renderHook(() => useStartDm());

        let second: unknown;
        await act(async () => {
            const first = result.current.startDm('u-1');
            second = await result.current.startDm('u-1');
            resolve({ id: 'dm-1' });
            await first;
        });

        expect(startDm).toHaveBeenCalledTimes(1);
        expect(second).toBeNull();
    });

    it('returns null, toasts and opens nothing when the server refuses', async () => {
        startDm.mockRejectedValue(new Error('denied'));
        const { result } = renderHook(() => useStartDm());

        let room: unknown = 'unset';
        await act(async () => {
            room = await result.current.startDm('u-1');
        });

        expect(room).toBeNull();
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        expect(usePendingOpenStore.getState().target).toBeNull();
        expect(result.current.isStarting).toBe(false);
    });

    it('treats a room without an id as a failure', async () => {
        startDm.mockResolvedValue({});
        const { result } = renderHook(() => useStartDm());

        let room: unknown = 'unset';
        await act(async () => {
            room = await result.current.startDm('u-1');
        });

        expect(room).toBeNull();
        expect(usePendingOpenStore.getState().target).toBeNull();
    });

    it('is unavailable, and calls nothing, on the default (relay) cloud', async () => {
        activeCloudId = 'default';
        const { result } = renderHook(() => useStartDm());

        expect(result.current.isAvailable).toBe(false);
        await act(async () => {
            await result.current.startDm('u-1');
        });
        expect(startDm).not.toHaveBeenCalled();
    });

    it('opens nothing when the cloud changed while the call was in flight', async () => {
        let resolve: (room: unknown) => void = () => undefined;
        startDm.mockReturnValue(new Promise(r => (resolve = r)));
        const { result, rerender } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        activeCloudId = 'cloud-2';
        rerender();
        let room: unknown = 'unset';
        await act(async () => {
            resolve({ id: 'dm-1' });
            room = await pending;
        });

        // The room belongs to the cloud that was left; opening its id here could land on another room.
        expect(room).toBeNull();
        expect(usePendingOpenStore.getState().target).toBeNull();
        expect(toast).not.toHaveBeenCalled();
    });

    it('is unavailable while no cloud is active yet', () => {
        activeCloudId = '';
        const { result } = renderHook(() => useStartDm());

        expect(result.current.isAvailable).toBe(false);
    });

    describe('openSelf', () => {
        it('opens my notes-to-self room through get-self, never start-dm', async () => {
            // start-dm answers 400 for my own id; the self room has its own get-or-create call.
            getSelfChannel.mockResolvedValue({ id: 'U:me', stereo: 'self', sid: 'site-1' });
            const { result } = renderHook(() => useStartDm());

            let room: unknown;
            await act(async () => {
                room = await result.current.openSelf();
            });

            expect(getSelfChannel).toHaveBeenCalledWith(undefined, 'site-1');
            expect(startDm).not.toHaveBeenCalled();
            expect(room).toEqual({ id: 'U:me', stereo: 'self', sid: 'site-1' });
            expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: '', channelId: 'U:me' });
            expect(syncChannels).not.toHaveBeenCalled();
        });

        it('is unavailable without an open place, which the row has to be tagged with', async () => {
            selectedSiteId = null;
            const { result } = renderHook(() => useStartDm());

            expect(result.current.canOpenSelf).toBe(false);
            let room: unknown = 'unset';
            await act(async () => {
                room = await result.current.openSelf();
            });
            expect(room).toBeNull();
            expect(getSelfChannel).not.toHaveBeenCalled();
        });

        it('is unavailable on the default cloud', () => {
            activeCloudId = 'default';
            const { result } = renderHook(() => useStartDm());

            expect(result.current.canOpenSelf).toBe(false);
        });

        it('shows the failure toast and returns null when get-self fails', async () => {
            getSelfChannel.mockRejectedValue(new Error('unsupported'));
            const { result } = renderHook(() => useStartDm());

            let room: unknown = 'unset';
            await act(async () => {
                room = await result.current.openSelf();
            });

            expect(room).toBeNull();
            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'dm.start.failed' }));
            expect(usePendingOpenStore.getState().target).toBeNull();
        });

        it('shares the one in-flight guard with startDm', async () => {
            let resolve: (room: unknown) => void = () => undefined;
            startDm.mockReturnValue(new Promise(r => (resolve = r)));
            const { result } = renderHook(() => useStartDm());

            let pending: Promise<unknown> = Promise.resolve();
            act(() => {
                pending = result.current.startDm('u-1');
            });
            let self: unknown = 'unset';
            await act(async () => {
                self = await result.current.openSelf();
            });
            expect(self).toBeNull();
            expect(getSelfChannel).not.toHaveBeenCalled();

            await act(async () => {
                resolve({ id: 'dm-1', sid: 'site-1' });
                await pending;
            });
        });

        it('blocks startDm while it is in flight', async () => {
            let resolve: (room: unknown) => void = () => undefined;
            getSelfChannel.mockReturnValue(new Promise(r => (resolve = r)));
            const { result } = renderHook(() => useStartDm());

            let pending: Promise<unknown> = Promise.resolve();
            act(() => {
                pending = result.current.openSelf();
            });
            let dm: unknown = 'unset';
            await act(async () => {
                dm = await result.current.startDm('u-1');
            });
            expect(dm).toBeNull();
            expect(startDm).not.toHaveBeenCalled();

            await act(async () => {
                resolve({ id: 'U:me', sid: 'site-1' });
                await pending;
            });
        });

        it('opens nothing when the cloud changed while the call was in flight', async () => {
            let resolve: (room: unknown) => void = () => undefined;
            getSelfChannel.mockReturnValue(new Promise(r => (resolve = r)));
            const { result, rerender } = renderHook(() => useStartDm());

            let pending: Promise<unknown> = Promise.resolve();
            act(() => {
                pending = result.current.openSelf();
            });
            activeCloudId = 'cloud-2';
            rerender();
            let room: unknown = 'unset';
            await act(async () => {
                resolve({ id: 'U:me', sid: 'site-1' });
                room = await pending;
            });

            expect(room).toBeNull();
            expect(usePendingOpenStore.getState().target).toBeNull();
        });
    });
});
