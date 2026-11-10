import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook as renderBareHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

// The channel-write hook it uses reads the app's switch mutations, so it needs the query client.
const renderHook = <T,>(hook: () => T) =>
    renderBareHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client: new QueryClient() }, children),
    });

const updateJoin = vi.fn(async (_payload: unknown) => ({}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                channel: {},
                join: { updateJoin: (payload: unknown) => updateJoin(payload) },
            }),
        },
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 'p1' }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));

const listed = vi.hoisted(() => ({ channels: [] as DomainChannel[] }));
vi.mock('./useChannels', () => ({ useChannels: () => ({ channels: listed.channels, isLoading: false }) }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

import '../../../i18n';

import { useNotificationPrefsStore } from '../stores';
import { usePlaceNotify } from './usePlaceNotify';

const group = (id: string, notify?: 'all' | 'mention' | 'none') =>
    ({ id, stereo: 'group', $join: { userId: 'cloud-me', notify } }) as unknown as DomainChannel;
const dm = { id: 'D1', stereo: 'dm', $join: { userId: 'cloud-me' } } as unknown as DomainChannel;
const self = { id: 'S1', stereo: 'self', $join: { userId: 'cloud-me' } } as unknown as DomainChannel;

const written = () => updateJoin.mock.calls.map(([payload]) => payload);

describe('usePlaceNotify', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateJoin.mockResolvedValue({});
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {}, placeNotify: {} });
        listed.channels = [group('G1'), group('G2'), dm, self];
    });

    it('writes the chosen level to every channel of the place, locally and to the server', async () => {
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('none'));

        expect(useNotificationPrefsStore.getState().channelNotify).toEqual({ G1: 'none', G2: 'none', D1: 'none' });
        expect(written()).toEqual([
            { channelId: 'G1', userId: 'cloud-me', notify: 'none' },
            { channelId: 'G2', userId: 'cloud-me', notify: 'none' },
            { channelId: 'D1', userId: 'cloud-me', notify: 'none' },
        ]);
        expect(useNotificationPrefsStore.getState().placeNotify['c1:p1']).toEqual({
            mode: 'none',
            known: ['G1', 'G2', 'D1'],
        });
        expect(result.current.mode).toBe('none');
        expect(result.current.exceptions).toBe(0);
    });

    it('never sends "mentions only" to a 1:1, which has no such level', async () => {
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('mention'));

        // The 1:1 already reads as "all", so it needs no write at all.
        expect(written()).toEqual([
            { channelId: 'G1', userId: 'cloud-me', notify: 'mention' },
            { channelId: 'G2', userId: 'cloud-me', notify: 'mention' },
        ]);
        expect(result.current.exceptions).toBe(0);
    });

    it('leaves my notes-to-self room out', async () => {
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('none'));

        expect(written().some(payload => (payload as { channelId: string }).channelId === 'S1')).toBe(false);
    });

    it('sends nothing for channels already at the chosen level', async () => {
        useNotificationPrefsStore.setState({ channelNotify: { G1: 'none' } });
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('none'));

        expect(written().map(payload => (payload as { channelId: string }).channelId)).toEqual(['G2', 'D1']);
    });

    it('keeps channels it did not see this time as known', async () => {
        useNotificationPrefsStore.setState({ placeNotify: { 'c1:p1': { mode: 'all', known: ['OLD'] } } });
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('none'));

        expect(useNotificationPrefsStore.getState().placeNotify['c1:p1'].known).toEqual(['OLD', 'G1', 'G2', 'D1']);
    });

    it('counts the channels set differently from the place', () => {
        useNotificationPrefsStore.setState({
            channelNotify: { G1: 'all' },
            placeNotify: { 'c1:p1': { mode: 'none', known: ['G1', 'G2', 'D1'] } },
        });
        listed.channels = [
            group('G1'),
            group('G2', 'none'),
            { ...dm, $join: { userId: 'cloud-me', notify: 'none' } } as DomainChannel,
        ];
        const { result } = renderHook(() => usePlaceNotify('p1'));

        expect(result.current.mode).toBe('none');
        expect(result.current.exceptions).toBe(1);
    });

    it('shows no level for a place whose channels differ and that was never set', () => {
        listed.channels = [group('G1', 'none'), group('G2', 'all')];
        const { result } = renderHook(() => usePlaceNotify('p1'));

        expect(result.current.mode).toBeNull();
        expect(result.current.exceptions).toBe(1);
    });

    it('announces one failure for a batch the server refused', async () => {
        updateJoin.mockRejectedValue(new Error('refused'));
        const { result } = renderHook(() => usePlaceNotify('p1'));

        await act(async () => result.current.setMode('none'));

        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
});
