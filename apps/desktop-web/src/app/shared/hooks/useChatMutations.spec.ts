import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

import type * as ChatOutboxModule from './useChatOutbox';

const sendChatInCloud = vi.fn();
const cloudCacheDelete = vi.fn();
const getCloudRepositories = vi.fn((_cid: string) => ({ chat: { cacheDelete: cloudCacheDelete } }));
const outboxRemove = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            // The app graph, which follows the selection. Send, retry and discard must not go through it.
            useRuntimeRepositories: () => ({ chat: { sendChat: vi.fn(), cacheDelete: vi.fn() } }),
            getCloudRepositories: (cid: string) => getCloudRepositories(cid),
            sendChatInCloud: (cid: string, payload: unknown) => sendChatInCloud(cid, payload),
        },
    },
}));
vi.mock('./useChatOutbox', async () => ({
    ...(await vi.importActual<typeof ChatOutboxModule>('./useChatOutbox')),
    getChatOutbox: () => ({ remove: outboxRemove }),
}));

import { useChatMutations } from './useChatMutations';

const failed = (over: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'row-1',
        cid: 'cloud-a',
        channelId: 'ch-1',
        content: 'hello',
        contentType: 'text',
        isFailed: true,
        ...over,
    }) as DomainChat;

describe('useChatMutations', () => {
    beforeEach(() => {
        sendChatInCloud.mockReset().mockResolvedValue({ id: 'ch-1:9' });
        cloudCacheDelete.mockReset().mockResolvedValue(undefined);
        getCloudRepositories.mockClear();
        outboxRemove.mockReset();
    });

    it('sends to the cloud the caller names', async () => {
        const { result } = renderHook(() => useChatMutations());

        await result.current.sendMessage('cloud-a', { channelId: 'ch-1', content: 'hi' });

        expect(sendChatInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'ch-1', content: 'hi' });
    });

    it('rejects a send without content and sends nothing', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.sendMessage('cloud-a', { channelId: 'ch-1', content: '' })).rejects.toThrow();
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });

    it('retries in the message own cloud: retire the queue entry, delete the row there, then send there', async () => {
        const { result } = renderHook(() => useChatMutations());

        await result.current.retryMessage(failed());

        expect(outboxRemove).toHaveBeenCalledWith('row-1');
        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(cloudCacheDelete).toHaveBeenCalledWith('row-1');
        expect(sendChatInCloud).toHaveBeenCalledWith('cloud-a', {
            channelId: 'ch-1',
            content: 'hello',
            contentType: 'text',
            parentId: undefined,
        });
        // The stale row is gone before the resend puts its new optimistic row in.
        expect(cloudCacheDelete.mock.invocationCallOrder[0]).toBeLessThan(sendChatInCloud.mock.invocationCallOrder[0]);
    });

    it('retries a row without a cloud id in the relay', async () => {
        const { result } = renderHook(() => useChatMutations());

        await result.current.retryMessage(failed({ cid: undefined }));

        expect(getCloudRepositories).toHaveBeenCalledWith('default');
        expect(sendChatInCloud).toHaveBeenCalledWith('default', expect.anything());
    });

    it('does not resend when the stale row could not be deleted', async () => {
        // Sending anyway would leave two rows for one message, and a second failure a duplicate
        // "Not delivered" bubble; the failed row keeps its retry button instead.
        cloudCacheDelete.mockRejectedValue(new Error('store closed'));
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.retryMessage(failed())).rejects.toThrow('store closed');
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });

    it('rejects a retry of a message without content', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.retryMessage(failed({ content: '' }))).rejects.toThrow();
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });

    it("discards an unsent row from the message's own cloud, retiring its queue entry", async () => {
        const { result } = renderHook(() => useChatMutations());

        await result.current.discardMessage(failed({ cid: 'cloud-b' }));

        expect(outboxRemove).toHaveBeenCalledWith('row-1');
        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-b');
        expect(cloudCacheDelete).toHaveBeenCalledWith('row-1');
    });
});
