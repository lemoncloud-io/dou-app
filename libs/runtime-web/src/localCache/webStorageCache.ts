import type { CacheType } from '@chatic/bridge-messages';
import type { CacheStorage, DataContextProvider } from '@chatic/data';
import { WebStorageAdapter } from '@chatic/db';
import { getRecordedCloudIds, identityStore } from '@chatic/session';
import { asDomStorage } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

import type { WebCacheStore } from './cacheStore';
import { InvitedCloudImportStorage } from './invitedCloudImport';

export interface WebStorageCacheOptions {
    tab: KeyValueStore;
    importFrom: WebCacheStore;
    getDelegatorId?: () => string | null;
    getRecordedCloudIds?: () => string[];
}

export const webStorageCache = ({
    tab: tabStore,
    importFrom,
    getDelegatorId = () => identityStore.getDelegatorId(),
    getRecordedCloudIds: recordedCloudIds = getRecordedCloudIds,
}: WebStorageCacheOptions): WebCacheStore => ({
    storage: <TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType> => {
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
