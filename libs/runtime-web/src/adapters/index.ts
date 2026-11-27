import type { Adapter, PortName } from '@chatic/runtime-client';
import type { RuntimePorts } from '@chatic/runtime-core';

import { webAuthPorts } from '../auth';
import { webForegroundPorts } from '../foreground';
import { BROWSER_HOST_FACTS } from '../hostFacts';
import type { WebHostFacts } from '../hostFacts';
import { browserCachePorts, indexedDbCache, webStorageCache } from '../localCache';
import { localStorageStores, pageStorageAreas, tabStorageStores } from '../storage/storeSets';
import type { StorageStores } from '../storage/storeSets';
import { webTransportPorts } from '../transport';

export type WebAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], WebHostFacts>;

export const webHostFacts = (): WebHostFacts => BROWSER_HOST_FACTS;

export const tabStoreOf = (storage: RuntimePorts['storage']): StorageStores['webSession'] =>
    (storage as Partial<StorageStores>).webSession ?? pageStorageAreas().webSession;

export const transportBrowser: WebAdapter<'transport'> = {
    id: 'transport.browser',
    port: 'transport',
    create: () => webTransportPorts(),
};

export const authLocation: WebAdapter<'auth'> = {
    id: 'auth.location',
    port: 'auth',
    create: () => webAuthPorts(),
};

export const foregroundVisibility: WebAdapter<'foreground'> = {
    id: 'foreground.visibility',
    port: 'foreground',
    create: () => webForegroundPorts(),
};

export const storageTab: WebAdapter<'storage'> = {
    id: 'storage.tab',
    port: 'storage',
    create: () => tabStorageStores(pageStorageAreas()),
};

export const storageLocal: WebAdapter<'storage'> = {
    id: 'storage.local',
    port: 'storage',
    create: () => localStorageStores(pageStorageAreas()),
};

export const cacheIndexedDb: WebAdapter<'cache'> = {
    id: 'cache.indexeddb',
    port: 'cache',
    create: () => browserCachePorts({ indexedDb: indexedDbCache() }),
};

export const cacheWebStorage: WebAdapter<'cache'> = {
    id: 'cache.web-storage',
    port: 'cache',
    create: ({ storage }) => {
        const indexedDb = indexedDbCache();
        return browserCachePorts({
            indexedDb,
            webStorage: webStorageCache({ tab: tabStoreOf(storage), importFrom: indexedDb }),
        });
    },
};

export { pageLinks } from './pageLinks';
