import type { CacheType } from '@chatic/bridge-messages';
import type { CacheStorage, DataContextProvider } from '@chatic/data';
import { WebStorageAdapter } from '@chatic/db';
import { getRecordedCloudIds, identityStore } from '@chatic/session';
import { asDomStorage } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

import type { WebCacheStore } from './cacheStore';
import { InvitedCloudImportStorage } from './invitedCloudImport';

export interface WebStorageCacheOptions {
    /**
     * The tab-lifetime store the rows go in. A cache must hear a failed write, so it is a raw store
     * (the entry point's `webSession`), not the tolerant `tab`.
     */
    tab: KeyValueStore;
    /** Where invited clouds were kept before they moved to the tab: the store the one-time import reads. */
    importFrom: WebCacheStore;
    /** The tab's guest, read when the import runs. The session's own by default. */
    getDelegatorId?: () => string | null;
    /** Clouds this tab's session holds a uid in, read when the import runs. The session's own by default. */
    getRecordedCloudIds?: () => string[];
}

/**
 * The tab's own web storage as a cache store (`cache.web-storage`). Invited clouds — its only domain
 * in a page today — were kept in IndexedDB before, so their store also carries the rows this tab
 * entered there across, once per tab (`InvitedCloudImportStorage`).
 */
export const webStorageCache = ({
    tab: tabStore,
    importFrom,
    getDelegatorId = () => identityStore.getDelegatorId(),
    getRecordedCloudIds: recordedCloudIds = getRecordedCloudIds,
}: WebStorageCacheOptions): WebCacheStore => ({
    storage: <TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> => {
        // The tab store, seen as the DOM `Storage` the engine takes: the domain ends with the tab.
        const tab = asDomStorage(tabStore);
        const store = new WebStorageAdapter(tab, type, contextProvider);
        if (type !== 'invitecloud') return store;
        return new InvitedCloudImportStorage(
            store as unknown as CacheStorage<'invitecloud'>,
            () => importFrom.storage('invitecloud', contextProvider),
            { marker: tab, getDelegatorId, getRecordedCloudIds: recordedCloudIds }
        ) as unknown as CacheStorage<TType>;
    },
});
