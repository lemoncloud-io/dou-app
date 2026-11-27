import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data';
import { NativeDBAdapter, NativeGlobalSearchSource } from '@chatic/db';
import type { CacheBridgeClient } from '@chatic/db';
import { webClient } from '@chatic/bridges';

import type { SearchableWebCacheStore } from '@chatic/runtime-web';
import { isCacheMessageHandledBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';

export interface ShellSqliteCacheOptions {
    support: () => NativeCacheSupport | null;
    client?: CacheBridgeClient;
}

export const shellSqliteCache = ({
    support,
    client = webClient,
}: ShellSqliteCacheOptions): SearchableWebCacheStore => ({
    storage: <TType extends CacheType>(type: TType, contextProvider: DataContextProvider): NativeDBAdapter<TType> =>
        new NativeDBAdapter(client, type, contextProvider, {
            handlesMessage: message => isCacheMessageHandledBy(support(), message),
        }),
    globalSearch: () => new NativeGlobalSearchSource(client),
});
