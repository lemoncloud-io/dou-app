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

const updateJoin = vi.fn(async () => ({}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                channel: {},
                join: { updateJoin: (...args: unknown[]) => updateJoin(...args) },
            }),
        },
        session: { useSessionSelection: () => ({ selectedSiteId: 'site-1' }) },
    },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

import '../../../i18n';

import { useNotificationPrefsStore } from '../stores';
import { useChannelNotifyChange } from './useChannelNotifyChange';

const channel = { id: 'C1', $join: { userId: 'cloud-me' } } as DomainChannel;

describe('useChannelNotifyChange', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateJoin.mockResolvedValue({});
        useNotificationPrefsStore.setState({ channelNotify: {} });
    });

    it('applies the local pref instantly and syncs it to the server', async () => {
        const { result } = renderHook(() => useChannelNotifyChange(channel, 'me'));

        await act(async () => {
            result.current.onNotifyChange('none');
        });

        expect(useNotificationPrefsStore.getState().channelNotify).toEqual({ C1: 'none' });
        expect(updateJoin).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
    });

    it('announces a sync failure while the local pref stands', async () => {
        updateJoin.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useChannelNotifyChange(channel, 'me'));

        await act(async () => {
            result.current.onNotifyChange('mention');
        });

        // This device still follows the new mode; only the other devices drift.
        expect(useNotificationPrefsStore.getState().channelNotify).toEqual({ C1: 'mention' });
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });

    it('does nothing when the mode is unchanged', async () => {
        const { result } = renderHook(() => useChannelNotifyChange(channel, 'me'));

        await act(async () => {
            result.current.onNotifyChange('all');
        });

        expect(updateJoin).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });
});
