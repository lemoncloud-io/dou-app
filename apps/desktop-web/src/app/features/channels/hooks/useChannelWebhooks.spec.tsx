import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
    list: vi.fn(),
    issue: vi.fn(),
    setPaused: vi.fn(),
    setExpiresAt: vi.fn(),
    remove: vi.fn(),
}));
const socket = vi.hoisted(() => ({ isVerified: true }));

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({ webhook: repo }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: socket.isVerified }) },
    })
);

import { useChannelWebhooks } from './useChannelWebhooks';

const w = (id: string, over = {}) => ({
    id,
    channelId: 'C1',
    name: id,
    desc: '',
    paused: false,
    expiresAt: 0,
    lastUsedAt: 7,
    createdAt: 1,
    ...over,
});

describe('useChannelWebhooks', () => {
    beforeEach(() => {
        Object.values(repo).forEach(fn => fn.mockReset());
        socket.isVerified = true;
    });

    it('loads the list once the socket is verified', async () => {
        repo.list.mockResolvedValue([w('a')]);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.webhooks).toEqual([w('a')]);
        expect(repo.list).toHaveBeenCalledWith('C1');
    });

    it('waits while unverified and reads nothing without a channel', () => {
        socket.isVerified = false;
        renderHook(() => useChannelWebhooks('C1'));
        renderHook(() => useChannelWebhooks(null));
        expect(repo.list).not.toHaveBeenCalled();
    });

    it('reports an error and retries', async () => {
        repo.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('error'));
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.status).toBe('ready'));
    });

    it('issue prepends the row and hands the token back without keeping it', async () => {
        repo.list.mockResolvedValue([w('a')]);
        repo.issue.mockResolvedValue({ webhook: w('b'), token: 'wh:b:secret' });
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        let issued: { token: string } | undefined;
        await act(async () => {
            issued = await result.current.issue({ name: 'b' });
        });

        expect(issued?.token).toBe('wh:b:secret');
        expect(result.current.webhooks.map(r => r.id)).toEqual(['b', 'a']);
        expect(JSON.stringify(result.current.webhooks)).not.toContain('secret');
    });

    it('patches a row from the requested value, leaving other fields alone', async () => {
        repo.list.mockResolvedValue([w('a')]);
        repo.setPaused.mockResolvedValue(undefined);
        repo.setExpiresAt.mockResolvedValue(undefined);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setPaused('a', true);
            await result.current.setExpiresAt('a', 99);
        });
        expect(result.current.webhooks[0]).toMatchObject({ paused: true, expiresAt: 99, lastUsedAt: 7 });
    });

    it('keeps the row when a write fails, and drops it when a delete succeeds', async () => {
        repo.list.mockResolvedValue([w('a')]);
        repo.setPaused.mockRejectedValue(new Error('403'));
        repo.remove.mockResolvedValue(undefined);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await expect(result.current.setPaused('a', true)).rejects.toThrow('403');
        });
        expect(result.current.webhooks[0].paused).toBe(false);

        await act(async () => {
            await result.current.remove('a');
        });
        expect(result.current.webhooks).toEqual([]);
    });
});
