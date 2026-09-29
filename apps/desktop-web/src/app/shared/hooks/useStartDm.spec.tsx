import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

let activeCloudId = 'cloud-1';
const startDm = vi.fn();
const toast = vi.fn();
const repositories = { channel: { startDm } };

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: { useGlobalSession: () => ({ cloud: { cloudId: activeCloudId } }) },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { usePendingOpenStore } from '../stores';
import { useStartDm } from './useStartDm';

describe('useStartDm', () => {
    beforeEach(() => {
        activeCloudId = 'cloud-1';
        startDm.mockReset();
        toast.mockReset();
        usePendingOpenStore.setState({ target: null });
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
        // An empty place is "stay where you are": a cloud 1:1 is listed in every place.
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
});
