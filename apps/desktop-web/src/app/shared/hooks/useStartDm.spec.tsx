import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook as renderBareHook } from '@testing-library/react';

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
            getGlobalSessionContext: () => ({ cloud: { cloudId: activeCloudId, siteId: selectedSiteId } }),
            SWITCH_SITE_MUTATION_KEY: ['switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
        },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: (...args: unknown[]) => warn(...args) } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { usePendingOpenStore } from '../stores';
import { useStartDm } from './useStartDm';

let queryClient = new QueryClient();
const renderHook = <T,>(hook: () => T) =>
    renderBareHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client: queryClient }, children),
    });

/**
 * A switch in flight, the way the runtime's switch mutations register one. `settle` can run code
 * inside the mutation before it finishes — where the runtime rolls a failed place switch back.
 */
const startSwitch = (mutationKey: string[]) => {
    let settle: () => void = () => undefined;
    const done = new Promise<void>(resolve => (settle = resolve));
    let inside: () => void = () => undefined;
    const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationKey,
        mutationFn: async () => {
            await done;
            inside();
        },
    });
    const running = mutation.execute(undefined);
    return {
        settle: async (withinSwitch: () => void = () => undefined) => {
            inside = withinSwitch;
            settle();
            await running;
        },
    };
};
const startPlaceSwitch = () => startSwitch(['switch-site']);

describe('useStartDm', () => {
    beforeEach(() => {
        queryClient = new QueryClient();
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
        // A room that names no place opens with none, which is "stay where you are".
        expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: '', channelId: 'dm-1' });
    });

    it("lands the open on the room's own place", async () => {
        startDm.mockResolvedValue({ id: 'site-1@me@u-1', stereo: 'dm', sid: 'site-1' });
        const { result } = renderHook(() => useStartDm());

        await act(async () => {
            await result.current.startDm('u-1');
        });

        expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'site-1', channelId: 'site-1@me@u-1' });
        expect(warn).not.toHaveBeenCalled();
    });

    // The server files the room under the place the session is on when it answers. Sent mid-switch
    // the call would reach a session still on the place being left.
    it('waits for a running place switch before it asks the server', async () => {
        selectedSiteId = 'site-2';
        const placeSwitch = startPlaceSwitch();
        startDm.mockResolvedValue({ id: 'site-2@me@u-1', stereo: 'dm', sid: 'site-2' });
        const { result } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(startDm).not.toHaveBeenCalled();
        expect(result.current.isStarting).toBe(true);

        let room: unknown = 'unset';
        await act(async () => {
            await placeSwitch.settle();
            room = await pending;
        });

        expect(startDm).toHaveBeenCalledWith({ peerId: 'u-1' });
        expect(room).toMatchObject({ id: 'site-2@me@u-1' });
        expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'site-2' });
    });

    // A failed switch rolls the place back, and a second one may follow: the place the person asked
    // from is gone, so nothing is opened anywhere.
    it('sends nothing when the place moved again while it waited', async () => {
        selectedSiteId = 'site-2';
        const placeSwitch = startPlaceSwitch();
        const { result, rerender } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        selectedSiteId = 'site-1';
        rerender();
        let room: unknown = 'unset';
        await act(async () => {
            await placeSwitch.settle();
            room = await pending;
        });

        expect(room).toBeNull();
        expect(startDm).not.toHaveBeenCalled();
        expect(usePendingOpenStore.getState().target).toBeNull();
        expect(result.current.isStarting).toBe(false);
    });

    // The runtime rolls a failed switch back inside its own mutation, so the wait can end before any
    // render has seen the rollback.
    it('sends nothing when the switch it waited for rolled the place back', async () => {
        selectedSiteId = 'site-2';
        const placeSwitch = startPlaceSwitch();
        const { result } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        let room: unknown = 'unset';
        await act(async () => {
            await placeSwitch.settle(() => {
                selectedSiteId = 'site-1';
            });
            room = await pending;
        });

        expect(room).toBeNull();
        expect(startDm).not.toHaveBeenCalled();
    });

    it('waits for a running cloud switch too', async () => {
        const cloudSwitch = startSwitch(['switch-cloud']);
        startDm.mockResolvedValue({ id: 'site-1@me@u-1', stereo: 'dm', sid: 'site-1' });
        const { result } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(startDm).not.toHaveBeenCalled();

        await act(async () => {
            await cloudSwitch.settle();
            await pending;
        });
        expect(startDm).toHaveBeenCalledWith({ peerId: 'u-1' });
    });

    it('sends nothing when the cloud moved while it waited', async () => {
        selectedSiteId = 'site-2';
        const placeSwitch = startPlaceSwitch();
        const { result, rerender } = renderHook(() => useStartDm());

        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.startDm('u-1');
        });
        activeCloudId = 'cloud-2';
        rerender();
        await act(async () => {
            await placeSwitch.settle();
            await pending;
        });

        expect(startDm).not.toHaveBeenCalled();
    });

    // The place is fixed by the server; if it is not the one asked from, the room is opened where it
    // lives rather than left unlisted in this place.
    it("lands on the room's place, and says so, when it is not the place it was asked from", async () => {
        startDm.mockResolvedValue({ id: 'site-9@me@u-1', stereo: 'dm', sid: 'site-9' });
        const { result } = renderHook(() => useStartDm());

        await act(async () => {
            await result.current.startDm('u-1');
        });

        expect(warn).toHaveBeenCalledWith(
            'CHANNEL',
            expect.stringContaining('another place'),
            expect.objectContaining({ startedAt: 'site-1', roomPlaceId: 'site-9' })
        );
        expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'site-9', channelId: 'site-9@me@u-1' });
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
            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'dm.start.failed' }));
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
