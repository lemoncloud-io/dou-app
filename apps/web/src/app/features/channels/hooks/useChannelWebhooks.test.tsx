import { act, renderHook, waitFor } from '@testing-library/react';

import { useChannelWebhooks } from './useChannelWebhooks';

const repo = { list: jest.fn(), issue: jest.fn(), setPaused: jest.fn(), setExpiresAt: jest.fn(), remove: jest.fn() };
let verified = true;

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({ webhook: repo }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: verified }) },
    })
);

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

beforeEach(() => {
    Object.values(repo).forEach(fn => fn.mockReset());
    verified = true;
});

describe('useChannelWebhooks', () => {
    it('loads the list once verified, and stays idle without a channel or a verified socket', async () => {
        repo.list.mockResolvedValue([w('a')]);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.webhooks).toEqual([w('a')]);

        repo.list.mockClear();
        verified = false;
        renderHook(() => useChannelWebhooks('C1'));
        verified = true;
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

        let token = '';
        await act(async () => {
            token = (await result.current.issue({ name: 'b' })).token;
        });

        expect(token).toBe('wh:b:secret');
        expect(result.current.webhooks.map(r => r.id)).toEqual(['b', 'a']);
        expect(JSON.stringify(result.current.webhooks)).not.toContain('secret');
    });

    it('patches from the requested value, keeps the row on failure, drops it on delete', async () => {
        repo.list.mockResolvedValue([w('a')]);
        repo.setPaused.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('403'));
        repo.setExpiresAt.mockResolvedValue(undefined);
        repo.remove.mockResolvedValue(undefined);
        const { result } = renderHook(() => useChannelWebhooks('C1'));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setPaused('a', true);
            await result.current.setExpiresAt('a', 99);
        });
        expect(result.current.webhooks[0]).toMatchObject({ paused: true, expiresAt: 99, lastUsedAt: 7 });

        await act(async () => {
            await expect(result.current.setPaused('a', false)).rejects.toThrow('403');
        });
        expect(result.current.webhooks[0].paused).toBe(true);

        await act(async () => {
            await result.current.remove('a');
        });
        expect(result.current.webhooks).toEqual([]);
    });
});
