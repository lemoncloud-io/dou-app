import { MemoryStore } from '@chatic/storage';
import type { DataContextProvider } from '@chatic/data';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined } as DataContextProvider;

describe('webLocalCachePorts — room media index on the phone shell', () => {
    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    it('lets the native chat storage use the index once the shell lists all three handlers, and not before', async () => {
        jest.resetModules();
        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        const ports = await import('./index');
        const storage = ports.webLocalCachePorts(new MemoryStore()).storage('chat', 'native', context, undefined);

        expect(storage.canQueryChatMedia?.()).toBe(false);

        ports.setNativeCacheSupport({ supportedWebMessages: ['FetchChatMediaCacheData', 'CountChatMediaCacheData'] });
        expect(storage.canQueryChatMedia?.()).toBe(false);

        ports.setNativeCacheSupport({
            supportedWebMessages: ['FetchChatMediaCacheData', 'CountChatMediaCacheData', 'SaveChatMediaCacheData'],
        });
        expect(storage.canQueryChatMedia?.()).toBe(true);

        ports.setNativeCacheSupport({ supportedWebMessages: ['FetchAllCacheData'] });
        expect(storage.canQueryChatMedia?.()).toBe(false);
    });
});
