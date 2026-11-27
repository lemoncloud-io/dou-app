import { hostProfile } from '@chatic/bridges';
import { prepareSecretStorage } from '@chatic/runtime-core';
import {
    indexedDbCache,
    pageStorageAreas,
    tabStoreOf,
    vaultStorageStores,
    webStorageCache,
    webTransportPorts,
} from '@chatic/runtime-web';
import type { WebAdapter, WebHostFacts } from '@chatic/runtime-web';

import { readWebHostFacts } from '../hostFacts';
import { routedCachePorts, shellSqliteCache } from '../localCache';
import { getNativeCacheSupport } from '../localCache/nativeCacheSupport';
import { isPhoneAppBridge } from '../localCache/routing';
import { createShellVault } from '../storage/shellVault';

export const webHostFacts = (): WebHostFacts => readWebHostFacts();

const inShell = (facts: WebHostFacts): boolean => facts.bridge !== null;

const shellKeepsVault = (facts: WebHostFacts): boolean => facts.storageMedia.includes('nativeSecure');

const profilePlatform = (): string | undefined => hostProfile().globals.CHATIC_APP_PLATFORM;

export const transportBrowser: WebAdapter<'transport'> = {
    id: 'transport.browser',
    port: 'transport',
    create: () => webTransportPorts({ appPlatform: profilePlatform }),
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

export { engineCandidates, engineLocal, engineMirror, engineShell } from './engine';
export type { EngineCandidate, EngineCandidateOutcome, EngineMirrorOptions, EngineShellOptions } from './engine';
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
export type {
    CheckoutImplementations,
    ShellOrBrowserAdapters,
    ShellOrBrowserBase,
    ShellOrBrowserImplementations,
    WebHostAdapter,
} from './hostPorts';
