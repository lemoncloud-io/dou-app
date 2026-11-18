import type { DataContextProvider } from '@chatic/data';
import type { CacheBridgeClient } from '@chatic/db';

import { readNativeCacheSupport } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';
import { shellSqliteCache } from './shellSqliteCache';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
const nameOf = (value: unknown) => (value as object).constructor.name;
const MEDIA = ['FetchChatMediaCacheData', 'CountChatMediaCacheData', 'SaveChatMediaCacheData'];

describe('shellSqliteCache', () => {
    const client = { request: jest.fn() } as unknown as CacheBridgeClient;

    it('builds a bridge adapter per domain over the client it is handed', () => {
        const storage = shellSqliteCache({ support: () => null, client }).storage('channel', context);

        expect(nameOf(storage)).toBe('NativeDBAdapter');
        expect((storage as unknown as { bridge: unknown }).bridge).toBe(client);
    });

    // The reply lands after the storage exists, so the report is asked on every media read.
    it('asks the report for the media index on each read, not once at construction', () => {
        let report: NativeCacheSupport | null = null;
        const storage = shellSqliteCache({ support: () => report, client }).storage('chat', context);

        expect(storage.canQueryChatMedia?.()).toBe(false);

        report = readNativeCacheSupport({ supportedWebMessages: MEDIA });
        expect(storage.canQueryChatMedia?.()).toBe(true);
    });

    it("searches through the shell's bridge", () => {
        const search = shellSqliteCache({ support: () => null, client }).globalSearch();

        expect(nameOf(search)).toBe('NativeGlobalSearchSource');
        expect((search as unknown as { bridge: unknown }).bridge).toBe(client);
    });
});
