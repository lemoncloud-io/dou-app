import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

let isVerified = true;
let observeHandler: ((result: { list: unknown[] }) => void) | null = null;

const userMocks = {
    observeList: vi.fn((query: unknown, handler: (result: { list: unknown[] }) => void) => {
        observeHandler = handler;
        return () => undefined;
    }),
    refreshList: vi.fn(async () => undefined),
    syncChannelUsers: vi.fn(async () => 123),
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ user: userMocks }) },
        connection: { useRuntimeSocketState: () => ({ isVerified }) },
    },
}));

import { useChannelMembers } from './useChannelMembers';

const member = (id: string) => ({ id, name: id });

describe('useChannelMembers sync failures', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isVerified = true;
        observeHandler = null;
        userMocks.syncChannelUsers.mockResolvedValue(123);
        userMocks.refreshList.mockResolvedValue(undefined);
    });

    const renderMembers = () => renderHook(() => useChannelMembers('C1'));
    const deliverRoster = (list: unknown[]) =>
        act(() => {
            observeHandler?.({ list });
        });

    it('surfaces a snapshot failure as error', async () => {
        userMocks.refreshList.mockRejectedValueOnce(new Error('denied'));
        const { result } = renderMembers();

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.error?.message).toBe('denied');
        expect(result.current.syncError).toBeNull();
    });

    it('surfaces a delta failure as syncError without hiding the roster', async () => {
        userMocks.syncChannelUsers.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderMembers();
        deliverRoster([member('u1')]);

        await waitFor(() => expect(result.current.syncError).not.toBeNull());
        expect(result.current.error).toBeNull();
        expect(result.current.members.map(m => m.id)).toEqual(['u1']);
    });

    it('does not advance the delta cursor after a failure', async () => {
        userMocks.syncChannelUsers.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderMembers();

        await waitFor(() => expect(result.current.syncError).not.toBeNull());
        expect(userMocks.syncChannelUsers).toHaveBeenCalledWith({ channelId: 'C1', since: 0 });

        await act(async () => {
            result.current.retry();
        });
        // Retries from the same cursor — the failed delta is redriven, not skipped.
        await waitFor(() => expect(userMocks.syncChannelUsers).toHaveBeenCalledTimes(2));
        expect(userMocks.syncChannelUsers).toHaveBeenLastCalledWith({ channelId: 'C1', since: 0 });
    });

    it('advances the cursor on delta success', async () => {
        const { result } = renderMembers();

        await waitFor(() => expect(userMocks.syncChannelUsers).toHaveBeenCalledTimes(1));

        await act(async () => {
            result.current.retry();
        });
        await waitFor(() => expect(userMocks.syncChannelUsers).toHaveBeenCalledTimes(2));
        expect(userMocks.syncChannelUsers).toHaveBeenLastCalledWith({ channelId: 'C1', since: 123 });
    });

    it('retry clears errors and re-runs both loads', async () => {
        userMocks.refreshList.mockRejectedValueOnce(new Error('denied'));
        userMocks.syncChannelUsers.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderMembers();

        await waitFor(() => expect(result.current.error).not.toBeNull());
        await waitFor(() => expect(result.current.syncError).not.toBeNull());

        await act(async () => {
            result.current.retry();
        });

        await waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.syncError).toBeNull();
        expect(userMocks.refreshList).toHaveBeenCalledTimes(2);
    });
});
