import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';

import { beginChatSendTrace } from '../../../runtime/perf';
import { toResendPayload, useChatMutations } from './useChatMutations';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
            sendChatInCloud: jest.fn(),
            getCloudRepositories: jest.fn(),
        },
    },
}));

jest.mock('../../../runtime/perf', () => ({ beginChatSendTrace: jest.fn() }));

const sendChatInCloud = runtime.data.sendChatInCloud as jest.Mock;
const endSendTrace = jest.fn();
const getCloudRepositories = runtime.data.getCloudRepositories as jest.Mock;
// The app graph's chat repository — a send or an unsent-row delete must never reach it.
const appSendChat = jest.fn();
const appCacheDelete = jest.fn();
const cloudCacheDelete = jest.fn();

const chat = (fields: Partial<DomainChat>): DomainChat => fields as DomainChat;

beforeEach(() => {
    jest.clearAllMocks();
    (beginChatSendTrace as jest.Mock).mockReturnValue({ end: endSendTrace });
    sendChatInCloud.mockResolvedValue(chat({ id: 'c1:9', chatNo: 9 }));
    cloudCacheDelete.mockResolvedValue(undefined);
    getCloudRepositories.mockReturnValue({ chat: { cacheDelete: cloudCacheDelete } });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { sendChat: appSendChat, cacheDelete: appCacheDelete },
        join: {},
    });
});

describe('useChatMutations — cloud-addressed send', () => {
    it('sends through the cloud the caller names, not the app graph', async () => {
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.sendMessage('cloud-a', { channelId: 'c1', content: 'hi' });
        });

        expect(sendChatInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', content: 'hi' });
        expect(appSendChat).not.toHaveBeenCalled();
    });

    it('rejects an empty message without sending', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.sendMessage('cloud-a', { channelId: 'c1', content: '' })).rejects.toThrow();
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });

    it('clears the sending flag when the send fails', async () => {
        sendChatInCloud.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.sendMessage('cloud-a', { channelId: 'c1', content: 'hi' }).catch(() => undefined);
        });

        await waitFor(() => expect(result.current.isPending.send).toBe(false));
    });
});

describe('useChatMutations — chat_send trace', () => {
    it('times a send to its answer and records it as ok', async () => {
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.sendMessage('cloud-a', { channelId: 'c1', content: 'hi' });
        });

        expect(beginChatSendTrace).toHaveBeenCalledWith({ reply: false });
        expect(endSendTrace).toHaveBeenCalledWith('ok');
    });

    it('records a failed send as an error, and still rejects', async () => {
        sendChatInCloud.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.sendMessage('cloud-a', { channelId: 'c1', content: 'hi' })).rejects.toThrow(
            'offline'
        );
        expect(endSendTrace).toHaveBeenCalledWith('error');
    });

    it('tells a thread reply from a top-level send', async () => {
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.sendMessage('cloud-a', { channelId: 'c1', content: 'hi', parentId: 'c1:3' });
        });

        expect(beginChatSendTrace).toHaveBeenCalledWith({ reply: true });
    });

    it('times nothing for a send it refuses before sending', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(result.current.sendMessage('cloud-a', { channelId: 'c1', content: '' })).rejects.toThrow();
        expect(beginChatSendTrace).not.toHaveBeenCalled();
    });
});

describe('useChatMutations — unsent-row delete', () => {
    it('removes the row from the named cloud partition', async () => {
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.deleteMessage('cloud-a', 'tmp-1');
        });

        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(cloudCacheDelete).toHaveBeenCalledWith('tmp-1');
        expect(appCacheDelete).not.toHaveBeenCalled();
    });
});

describe('useChatMutations — retry', () => {
    it('deletes the failed row and resends it to the cloud the row belongs to', async () => {
        const order: string[] = [];
        cloudCacheDelete.mockImplementation(async () => void order.push('delete'));
        sendChatInCloud.mockImplementation(async () => {
            order.push('send');
            return chat({ chatNo: 10 });
        });
        const { result } = renderHook(() => useChatMutations());

        await act(async () => {
            await result.current.retryMessage(
                chat({ id: 'tmp-1', cid: 'cloud-b', channelId: 'c1', content: 'hi', isFailed: true })
            );
        });

        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-b');
        expect(cloudCacheDelete).toHaveBeenCalledWith('tmp-1');
        expect(sendChatInCloud).toHaveBeenCalledWith('cloud-b', { channelId: 'c1', content: 'hi' });
        expect(order).toEqual(['delete', 'send']);
    });

    it('rejects a row without an id and touches nothing', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(
            result.current.retryMessage(chat({ cid: 'cloud-b', channelId: 'c1', content: 'hi' }))
        ).rejects.toThrow();
        expect(cloudCacheDelete).not.toHaveBeenCalled();
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });

    it('keeps a row it could not resend — an empty one is refused before anything is deleted', async () => {
        const { result } = renderHook(() => useChatMutations());

        await expect(
            result.current.retryMessage(chat({ id: 'tmp-2', cid: 'cloud-b', channelId: 'c1', content: '' }))
        ).rejects.toThrow();
        expect(cloudCacheDelete).not.toHaveBeenCalled();
        expect(sendChatInCloud).not.toHaveBeenCalled();
    });
});

describe('toResendPayload', () => {
    it('carries a thread reply target and the content type across', () => {
        const payload = toResendPayload(
            chat({ channelId: 'c1', content: '{}', contentType: 'block', parentId: 'c1:4' })
        );

        expect(payload).toEqual({ channelId: 'c1', content: '{}', contentType: 'block', parentId: 'c1:4' });
    });

    it('rebuilds a bare chatNo parent into the full id', () => {
        expect(toResendPayload(chat({ channelId: 'c1', content: 'hi', parentId: '4' })).parentId).toBe('c1:4');
    });

    it('leaves out the fields a top-level plain message never had', () => {
        expect(toResendPayload(chat({ channelId: 'c1', content: 'hi' }))).toEqual({ channelId: 'c1', content: 'hi' });
    });
});
