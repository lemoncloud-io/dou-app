import type { IWebBridgeClient } from '@chatic/bridges';
import { NativeGlobalSearchSource } from './NativeGlobalSearchSource';

const okResponse = (items: unknown[]) => ({
    type: 'OnSearchGlobalCacheData' as const,
    success: true as const,
    data: { items },
});

const createBridge = (items: unknown[]): IWebBridgeClient =>
    ({
        request: jest.fn().mockResolvedValue(okResponse(items)),
    }) as unknown as IWebBridgeClient;

describe('NativeGlobalSearchSource', () => {
    it('returns empty result without calling the bridge for a blank keyword', async () => {
        const bridge = createBridge([]);
        const source = new NativeGlobalSearchSource(bridge);

        const result = await source.search('   ', { uid: 'user-1' });

        expect(result).toEqual({ channels: [], sites: [], chats: [] });
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('forwards the trimmed keyword, cid and uid to the bridge request', async () => {
        const bridge = createBridge([]);
        const source = new NativeGlobalSearchSource(bridge);

        await source.search('  lemon  ', { uid: 'user-1', cid: 'cloud-a' });

        expect(bridge.request).toHaveBeenCalledWith({
            type: 'SearchGlobalCacheData',
            data: { keyword: 'lemon', cid: 'cloud-a', uid: 'user-1' },
        });
    });

    it('classifies tagged items by _domain into channels/sites/chats', async () => {
        const bridge = createBridge([
            { id: 'ch-1', cid: 'cloud-a', name: 'Lemon Lounge', _domain: 'channel' },
            { id: 'site-1', cid: 'cloud-a', name: 'Lemon HQ', _domain: 'site' },
            { id: 'chat-1', cid: 'cloud-a', channelId: 'ch-1', chatNo: 1, content: 'hi lemon', _domain: 'chat' },
        ]);
        const source = new NativeGlobalSearchSource(bridge);

        const result = await source.search('lemon', { uid: 'user-1' });

        expect(result.channels.map(c => c.id)).toEqual(['ch-1']);
        expect(result.sites.map(s => s.id)).toEqual(['site-1']);
        expect(result.chats.map(c => c.id)).toEqual(['chat-1']);
    });

    it('returns empty arrays when the bridge responds with no items', async () => {
        const bridge = {
            request: jest.fn().mockResolvedValue(okResponse([]) as any),
        } as unknown as IWebBridgeClient;
        (bridge.request as jest.Mock).mockResolvedValueOnce({
            type: 'OnSearchGlobalCacheData',
            success: true,
            data: { items: null },
        });
        const source = new NativeGlobalSearchSource(bridge);

        const result = await source.search('lemon', { uid: 'user-1' });

        expect(result).toEqual({ channels: [], sites: [], chats: [] });
    });
});
