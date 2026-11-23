import type { Adapter, PortName } from '@chatic/runtime-client';
import { prepareSecretStorage } from '@chatic/runtime-core';
import type { RuntimePorts } from '@chatic/runtime-core';

import { webAuthPorts } from '../auth';
import { webForegroundPorts } from '../foreground';
import { readWebHostFacts } from '../hostFacts';
import type { WebHostFacts } from '../hostFacts';
import { indexedDbCache, routedCachePorts, shellSqliteCache, webStorageCache } from '../localCache';
import { getNativeCacheSupport } from '../localCache/nativeCacheSupport';
import { isPhoneAppBridge } from '../localCache/routing';
import {
    createShellVault,
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
} from '../storage/storeSets';
import type { StorageStores } from '../storage/storeSets';
import { webTransportPorts } from '../transport';

export type WebAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], WebHostFacts>;

export const webHostFacts = (): WebHostFacts => readWebHostFacts();

const inShell = (facts: WebHostFacts): boolean => facts.bridge !== null;

const shellKeepsVault = (facts: WebHostFacts): boolean => facts.storageMedia.includes('nativeSecure');

const tabStoreOf = (storage: RuntimePorts['storage']): StorageStores['webSession'] =>
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

export const storageVault: WebAdapter<'storage'> = {
    id: 'storage.vault',
    port: 'storage',
    supports: facts => inShell(facts) && shellKeepsVault(facts),
    create: async ({ sessionOwner }) => {
        const areas = pageStorageAreas();
        const vault = createShellVault({ fallback: areas.webSession });
        const stores = vaultStorageStores({ ...areas, vault });
        if (sessionOwner === 'native') return stores;
        await prepareSecretStorage({
            vault,
            plain: stores.plain,
            web: areas.webLocal,
            tab: areas.webSession,
            afterLogout: new URLSearchParams(window.location.search).get('logout') === '1',
        });
        return stores;
    },
};

export const cacheIndexedDb: WebAdapter<'cache'> = {
    id: 'cache.indexeddb',
    port: 'cache',
    create: () => routedCachePorts({ bridge: null, support: () => null, indexedDb: indexedDbCache() }),
};

export const cacheWebStorage: WebAdapter<'cache'> = {
    id: 'cache.web-storage',
    port: 'cache',
    create: ({ facts, storage }) => {
        const indexedDb = indexedDbCache();
        return routedCachePorts({
            bridge: facts.bridge,
            support: getNativeCacheSupport,
            indexedDb,
            webStorage: webStorageCache({ tab: tabStoreOf(storage), importFrom: indexedDb }),
        });
    },
};

export const cacheShellSqlite: WebAdapter<'cache'> = {
    id: 'cache.shell-sqlite',
    port: 'cache',
    supports: facts => isPhoneAppBridge(facts.bridge),
    create: ({ facts, storage }) => {
        const indexedDb = indexedDbCache();
        return routedCachePorts({
            bridge: facts.bridge,
            support: getNativeCacheSupport,
            indexedDb,
            shellSqlite: shellSqliteCache({ support: getNativeCacheSupport }),
            webStorage: webStorageCache({ tab: tabStoreOf(storage), importFrom: indexedDb }),
        });
    },
};

export { engineMirror } from './engine';
export type { EngineMirrorOptions } from './engine';
export {
    appShellAdapters,
    checkoutFromHost,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    diagnosticsAdapters,
    filesAdapters,
    linksAdapters,
    mediaAdapters,
    pushAdapters,
    signInAdapters,
} from './hostPorts';
export { pageLinks } from './pageLinks';
export type {
    CheckoutImplementations,
    ShellOrBrowserAdapters,
    ShellOrBrowserBase,
    ShellOrBrowserImplementations,
    WebHostAdapter,
} from './hostPorts';
