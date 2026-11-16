import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

const updateJoin = vi.fn(async (_payload: unknown) => ({}));

// The channel cache: one observer, re-emitted by `emit` the way a cache write re-emits.
const cache = vi.hoisted(() => ({
    listener: null as ((result: { list: DomainChannel[] }) => void) | null,
}));
const emit = (list: DomainChannel[]) => act(() => cache.listener?.({ list }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                channel: {
                    observeList: (_q: unknown, cb: (result: { list: DomainChannel[] }) => void) => {
                        cache.listener = cb;
                        return () => {
                            cache.listener = null;
                        };
                    },
                },
                join: { updateJoin: (payload: unknown) => updateJoin(payload) },
            }),
        },
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 'p1' }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

const live = vi.hoisted(() => ({ placeId: 'p1' as string | null }));
vi.mock('./switchesSettled', () => ({
    switchesSettled: () => Promise.resolve(),
    liveSelection: () => ({ cloudId: 'c1', placeId: live.placeId }),
}));

import '../../../i18n';

import { useNotificationPrefsStore } from '../stores';
import { usePlaceNotifyInheritance } from './usePlaceNotifyInheritance';

const channel = (id: string, sid: string) =>
    ({ id, sid, stereo: 'group', $join: { userId: 'cloud-me' } }) as unknown as DomainChannel;

const writtenIds = () => updateJoin.mock.calls.map(([payload]) => (payload as { channelId: string }).channelId);

const mount = () =>
    renderHook(() => usePlaceNotifyInheritance(), {
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client: new QueryClient() }, children),
    });

describe('usePlaceNotifyInheritance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        live.placeId = 'p1';
        updateJoin.mockResolvedValue({});
        useNotificationPrefsStore.setState({
            channelNotify: { G1: 'none' },
            mutedChannels: {},
            placeNotify: { 'c1:p1': { mode: 'none', known: ['G1'] } },
        });
    });

    it("gives a channel first seen in the place the place's level, once", async () => {
        mount();

        emit([channel('G1', 'p1'), channel('G2', 'p1')]);
        await act(async () => undefined);

        expect(writtenIds()).toEqual(['G2']);
        expect(useNotificationPrefsStore.getState().channelNotify.G2).toBe('none');
        expect(useNotificationPrefsStore.getState().placeNotify['c1:p1'].known).toEqual(['G1', 'G2']);

        // The next emit (a message, a read) finds it known and writes nothing more.
        emit([channel('G1', 'p1'), channel('G2', 'p1')]);
        await act(async () => undefined);
        expect(writtenIds()).toEqual(['G2']);
    });

    it('writes a channel once when two emits arrive before a switch settles', async () => {
        mount();

        emit([channel('G1', 'p1'), channel('G2', 'p1')]);
        emit([channel('G1', 'p1'), channel('G2', 'p1')]);
        await act(async () => undefined);

        expect(writtenIds()).toEqual(['G2']);
    });

    it('never overwrites a known channel the person set differently', () => {
        useNotificationPrefsStore.setState({ channelNotify: { G1: 'all' } });
        mount();

        emit([channel('G1', 'p1')]);

        expect(updateJoin).not.toHaveBeenCalled();
        expect(useNotificationPrefsStore.getState().channelNotify.G1).toBe('all');
    });

    it('waits to write another place until the session is in it', () => {
        useNotificationPrefsStore.setState({ placeNotify: { 'c1:p2': { mode: 'none', known: [] } } });
        mount();

        emit([channel('X1', 'p2')]);

        expect(updateJoin).not.toHaveBeenCalled();
        expect(useNotificationPrefsStore.getState().placeNotify['c1:p2'].known).toEqual([]);
    });

    it('leaves places with no chosen level alone', () => {
        mount();

        emit([channel('X1', 'p2')]);

        expect(updateJoin).not.toHaveBeenCalled();
        expect(useNotificationPrefsStore.getState().placeNotify['c1:p2']).toBeUndefined();
    });

    it('raises no toast for a refused write nobody asked for', async () => {
        updateJoin.mockRejectedValue(new Error('refused'));
        mount();

        emit([channel('G2', 'p1')]);
        await act(async () => undefined);

        expect(updateJoin).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
    });
});
