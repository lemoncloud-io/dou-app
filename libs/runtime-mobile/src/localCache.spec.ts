import { NativeCacheMetricsSource, NativeDBAdapter } from '@chatic/db';
import type { CacheBridgeClient } from '@chatic/db';
import type { DataContextProvider } from '@chatic/data';

import { NATIVE_CACHE_ROUTE, nativeLocalCachePorts } from './localCache';

const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }) } as unknown as DataContextProvider;

const fakeClient = () => {
    const request = jest.fn(async (message: { type: string }) => {
        if (message.type === 'SearchGlobalCacheData') {
            return { type: 'OnSearchGlobalCacheData', success: true, data: { items: [{ id: 's', _domain: 'site' }] } };
        }
        return { type: `On${message.type}`, success: true, data: { item: { id: 'u9' } } };
    });
    return { request } as unknown as CacheBridgeClient & { request: jest.Mock };
};

describe('nativeLocalCachePorts', () => {
    it.each(['channel', 'chat', 'user', 'join', 'site', 'invitecloud', 'profile', 'meta', 'invite'] as const)(
        "keeps '%s' in the app's database",
        type => {
            expect(nativeLocalCachePorts(fakeClient()).route(type)).toBe(NATIVE_CACHE_ROUTE);
        }
    );

    it("reads a domain's rows through the client", async () => {
        const client = fakeClient();
        const storage = nativeLocalCachePorts(client).storage('user', NATIVE_CACHE_ROUTE, context, undefined);

        expect(storage).toBeInstanceOf(NativeDBAdapter);
        await expect(storage.load('u9')).resolves.toEqual({ id: 'u9' });
        expect(client.request).toHaveBeenCalledWith({
            type: 'FetchCacheData',
            data: { type: 'user', cid: 'c1', uid: 'u1', id: 'u9' },
        });
    });

    it('refuses a route it did not make', () => {
        expect(() => nativeLocalCachePorts(fakeClient()).storage('user', 'web', context, undefined)).toThrow(
            "unknown cache route 'web'"
        );
    });

    it('searches through the client, and reports the native metrics', async () => {
        const client = fakeClient();
        const ports = nativeLocalCachePorts(client);

        await expect(ports.globalSearch().search('s', { cid: 'c1', uid: 'u1' } as never)).resolves.toMatchObject({
            sites: [{ id: 's' }],
        });
        expect(ports.metrics()).toBeInstanceOf(NativeCacheMetricsSource);
    });
});
