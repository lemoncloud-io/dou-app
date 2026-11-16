import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

const updateJoin = vi.hoisted(() => vi.fn(async (_payload: unknown) => ({})));
const observeList = vi.hoisted(() => vi.fn());

const cache = vi.hoisted(() => ({ rows: [] as DomainChannel[] }));

// The engine hands out one repositories object for the session; a fresh one per render would
// resubscribe the channel observer on every render.
const repositories = vi.hoisted(() => ({
    channel: {
        observeList: (query: unknown, cb: (result: { list: DomainChannel[] }) => void) => {
            observeList(query);
            cb({ list: cache.rows });
            return () => undefined;
        },
    },
    join: { updateJoin: (payload: unknown) => updateJoin(payload) },
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 'p1' }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));

vi.mock('./usePlaces', () => ({ usePlaces: () => ({ placeIds: ['p1', 'p2', 'p3'], places: [], isLoading: false }) }));

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
import { useCloudNotify } from './useCloudNotify';

const channel = (id: string, sid: string) =>
    ({ id, sid, stereo: 'group', $join: { userId: 'cloud-me' } }) as unknown as DomainChannel;

const mount = (cloudId: string) =>
    renderHook(() => useCloudNotify(cloudId), {
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client: new QueryClient() }, children),
    });

describe('useCloudNotify', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        live.placeId = 'p1';
        updateJoin.mockResolvedValue({});
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {}, placeNotify: {} });
        cache.rows = [channel('A1', 'p1'), channel('A2', 'p1'), channel('B1', 'p2')];
    });

    it('writes the place the session is in and remembers the level for every other place', async () => {
        const { result } = mount('c1');

        await act(async () => result.current.setMode('none'));

        // The server takes join writes only for the place the session is in (p1).
        const written = updateJoin.mock.calls.map(([payload]) => (payload as { channelId: string }).channelId);
        expect(written).toEqual(['A1', 'A2']);
        const { placeNotify } = useNotificationPrefsStore.getState();
        expect(placeNotify['c1:p1']).toEqual({ mode: 'none', known: ['A1', 'A2'] });
        // Written when the session enters them, empty places included.
        expect(placeNotify['c1:p2']).toEqual({ mode: 'none', known: [] });
        expect(placeNotify['c1:p3']).toEqual({ mode: 'none', known: [] });
        expect(result.current.mode).toBe('none');
    });

    it('shows no level while its places differ', () => {
        useNotificationPrefsStore.setState({
            placeNotify: {
                'c1:p1': { mode: 'none', known: [] },
                'c1:p2': { mode: 'all', known: [] },
                'c1:p3': { mode: 'none', known: [] },
            },
        });
        const { result } = mount('c1');

        expect(result.current.mode).toBeNull();
    });

    it('neither lists nor writes a cloud the session is not in', async () => {
        const { result } = mount('c2');

        await act(async () => result.current.setMode('none'));

        expect(result.current.isActive).toBe(false);
        expect(observeList).not.toHaveBeenCalled();
        expect(updateJoin).not.toHaveBeenCalled();
        expect(useNotificationPrefsStore.getState().placeNotify).toEqual({});
    });

    it('announces one failure for a cloud-wide batch the server refused', async () => {
        updateJoin.mockRejectedValue(new Error('refused'));
        const { result } = mount('c1');

        await act(async () => result.current.setMode('none'));

        expect(toast).toHaveBeenCalledTimes(1);
    });
});
