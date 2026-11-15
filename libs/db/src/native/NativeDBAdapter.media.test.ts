import type { DataContextProvider } from '@chatic/data';
import type { CacheBridgeClient } from './cacheBridge';
import { NativeDBAdapter, type OptionalNativeCacheMessage } from './NativeDBAdapter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined } as DataContextProvider;

const page = {
    items: [{ kind: 'image', idx: 0, ref: 'u', chatId: 'r:1', chatNo: 1, chat: { id: 'r:1' } }],
    nextCursorNo: null,
};

const fakeBridge = () => {
    const request = jest.fn(async (message: { type: string }) => {
        if (message.type === 'FetchChatMediaCacheData') {
            return { type: 'OnFetchChatMediaCacheData', success: true, data: { ...page } };
        }
        if (message.type === 'SaveChatMediaCacheData') {
            return { type: 'OnSaveChatMediaCacheData', success: true, data: { success: true } };
        }
        return {
            type: 'OnCountChatMediaCacheData',
            success: true,
            data: { counts: { image: 1, video: 0, file: 0, audio: 0, link: 0 } },
        };
    });
    return { request } as unknown as CacheBridgeClient & { request: jest.Mock };
};

const query = { channelId: 'r', kind: 'image' as const, limit: 10 };

describe('NativeDBAdapter — room media index reads', () => {
    it('sends both reads when the shell lists their handlers', async () => {
        const bridge = fakeBridge();
        const adapter = new NativeDBAdapter(bridge, 'chat', context, { handlesMessage: () => true });

        expect(adapter.canQueryChatMedia()).toBe(true);
        await expect(adapter.loadChatMedia({ ...query, cursorNo: 7 })).resolves.toEqual(page);
        await expect(adapter.countChatMedia('r')).resolves.toMatchObject({ image: 1 });
        expect(bridge.request.mock.calls.map(([message]) => message)).toEqual([
            {
                type: 'FetchChatMediaCacheData',
                data: { type: 'chat', cid: 'c1', uid: 'u1', channelId: 'r', kind: 'image', cursorNo: 7, limit: 10 },
            },
            { type: 'CountChatMediaCacheData', data: { type: 'chat', cid: 'c1', uid: 'u1', channelId: 'r' } },
        ]);
    });

    it.each([
        ['an older shell that lists neither', () => false],
        [
            'a shell that lists the two reads but not the fill',
            (message: OptionalNativeCacheMessage) => message !== 'SaveChatMediaCacheData',
        ],
        ['no support check at all', undefined],
    ])('never sends them to %s, and answers null for the plain-row path', async (_name, handlesMessage) => {
        const bridge = fakeBridge();
        const adapter = new NativeDBAdapter(bridge, 'chat', context, handlesMessage ? { handlesMessage } : {});

        expect(adapter.canQueryChatMedia()).toBe(false);
        await expect(adapter.loadChatMedia(query)).resolves.toBeNull();
        await expect(adapter.countChatMedia('r')).resolves.toBeNull();
        await expect(adapter.saveChatMediaEntries([], 1)).rejects.toThrow('no room media index');
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('sends a fill in one round trip, and throws when the shell did not write it', async () => {
        const bridge = fakeBridge();
        const adapter = new NativeDBAdapter(bridge, 'chat', context, { handlesMessage: () => true });
        const items = [
            { chatId: 'r:1', channelId: 'r', chatNo: 1, entries: [{ kind: 'image' as const, idx: 0, ref: 'u' }] },
        ];

        await adapter.saveChatMediaEntries(items, 1);
        expect(bridge.request).toHaveBeenCalledWith({
            type: 'SaveChatMediaCacheData',
            data: { type: 'chat', cid: 'c1', uid: 'u1', items, version: 1 },
        });

        bridge.request.mockResolvedValueOnce({
            type: 'OnSaveChatMediaCacheData',
            success: true,
            data: { success: false },
        });
        await expect(adapter.saveChatMediaEntries(items, 1)).rejects.toThrow('did not write');
    });

    it('asks on every call, so a handshake that lands after construction is seen', async () => {
        const bridge = fakeBridge();
        let reported = false;
        const adapter = new NativeDBAdapter(bridge, 'chat', context, { handlesMessage: () => reported });

        await expect(adapter.loadChatMedia(query)).resolves.toBeNull();
        reported = true;
        await expect(adapter.loadChatMedia(query)).resolves.toEqual(page);
    });

    it('answers null for a native processing error or a bridge failure, for that read only', async () => {
        const bridge = fakeBridge();
        const adapter = new NativeDBAdapter(bridge, 'chat', context, { handlesMessage: () => true });

        bridge.request.mockResolvedValueOnce({
            type: 'OnFetchChatMediaCacheData',
            success: true,
            data: { items: null },
        });
        await expect(adapter.loadChatMedia(query)).resolves.toBeNull();
        bridge.request.mockRejectedValueOnce({ code: 'TIMEOUT' });
        await expect(adapter.countChatMedia('r')).resolves.toBeNull();
        await expect(adapter.loadChatMedia(query)).resolves.toEqual(page);
    });

    it('is a chat-only query', () => {
        expect(
            new NativeDBAdapter(fakeBridge(), 'user', context, { handlesMessage: () => true }).canQueryChatMedia()
        ).toBe(false);
    });
});
