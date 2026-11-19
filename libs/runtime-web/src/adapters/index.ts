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

/**
 * An adapter for a web page: one way of filling one port, asked about this page's `WebHostFacts`.
 * Each one wraps the factory of the same port, so an adapter builds what that factory builds on its own.
 */
export type WebAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], WebHostFacts>;

/** The host facts a web declaration is resolved against: `readWebHostFacts()`, read once at start. */
export const webHostFacts = (): WebHostFacts => readWebHostFacts();

/** Whether the page has a shell's bridge to reach the shell's own stores over. */
const inShell = (facts: WebHostFacts): boolean => facts.bridge !== null;

/**
 * Whether the shell said, before the page ran, that it keeps a device vault. Being in a shell is not
 * enough: a shell from before the vault has a bridge too, and its session lives in `localStorage`.
 */
const shellKeepsVault = (facts: WebHostFacts): boolean => facts.storageMedia.includes('nativeSecure');

/**
 * The raw tab store the storage adapter built, so the cache's tab rows land in the same object as the
 * session. Where site data is blocked every raw web store is a fresh memory store, and two of them would
 * not see each other's rows. A storage port from outside this package carries no raw tab store; the
 * cache then opens the page's own.
 */
const tabStoreOf = (storage: RuntimePorts['storage']): StorageStores['webSession'] =>
    (storage as Partial<StorageStores>).webSession ?? pageStorageAreas().webSession;

// --- transport, auth, foreground: one answer per page ------------------------------------------------

/** `transport.browser` — the page's `navigator.onLine`, its user agent and its own `WebSocket`. */
export const transportBrowser: WebAdapter<'transport'> = {
    id: 'transport.browser',
    port: 'transport',
    create: () => webTransportPorts(),
};

/** `auth.location` — the page's `location.search`, and `location.replace('/?…')` at a session's end. */
export const authLocation: WebAdapter<'auth'> = {
    id: 'auth.location',
    port: 'auth',
    create: () => webAuthPorts(),
};

/** `foreground.visibility` — the document's `visibilityState` and its `visibilitychange` event. */
export const foregroundVisibility: WebAdapter<'foreground'> = {
    id: 'foreground.visibility',
    port: 'foreground',
    create: () => webForegroundPorts(),
};

// --- storage: where the session is kept ---------------------------------------------------------------

/** `storage.tab` — the whole session in the tab's `sessionStorage`, ending with the tab. Any page. */
export const storageTab: WebAdapter<'storage'> = {
    id: 'storage.tab',
    port: 'storage',
    create: () => tabStorageStores(pageStorageAreas()),
};

/**
 * `storage.local` — the whole session in `localStorage`, surviving a relaunch: a shell from before the
 * vault. Any page can hold it, so it is not limited to a shell.
 */
export const storageLocal: WebAdapter<'storage'> = {
    id: 'storage.local',
    port: 'storage',
    create: () => localStorageStores(pageStorageAreas()),
};

/**
 * `storage.vault` — the session's secrets in the shell's device vault, the plain state in
 * `localStorage`. Needs a shell that said it keeps the vault (`nativeSecure` in its storage media). The
 * vault is loaded here, through the same secret-storage step an entry point runs, because the runtime
 * reads it synchronously from the start; its fallback is the same tab store the set hands out.
 *
 * Not on a launch whose session the shell owns: the vault is then the shell's alone, and the page must
 * not open it. `engine.mirror` builds no port at all on such a launch; a storage built while the engine
 * says the shell owns the session (`sessionOwner: 'native'`) hands out the stores without loading the
 * vault. A vault the shell confirms only in its handshake (apps/web's late-vault mark) is still the
 * entry point's to carry into the next load.
 */
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

// --- cache: one adapter per set of stores the rows may go to ---------------------------------------
//
// Each set routes by the one table (`resolveCacheBackendFor`); a set without a store keeps on IndexedDB
// what would have gone there. The cache's tab store is the storage port's raw `webSession`, never a
// tolerant one: a cache must hear a failed write.

/** `cache.indexeddb` — every domain in the page's IndexedDB. Any page. */
export const cacheIndexedDb: WebAdapter<'cache'> = {
    id: 'cache.indexeddb',
    port: 'cache',
    create: () => routedCachePorts({ bridge: null, support: () => null, indexedDb: indexedDbCache() }),
};

/**
 * `cache.web-storage` — IndexedDB, and a plain tab's invited clouds in the tab's own store so they end
 * with the tab's guest. What every web app's cache is in a browser. Any page.
 */
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

/**
 * `cache.shell-sqlite` — the phone shell's SQLite for every domain the installed shell can hold,
 * IndexedDB for the rest, and the tab store as `cache.web-storage` has it: the whole table
 * `webLocalCachePorts` routes by. Needs the phone app's bridge. The shell's report is read at each
 * decision, not from the facts, because it lands with the handshake, after the facts were read.
 */
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
    appShellBrowser,
    appShellHost,
    appShellShell,
    checkoutFromHost,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    diagnosticsBrowser,
    diagnosticsHost,
    diagnosticsShell,
    filesBrowser,
    filesHost,
    filesShell,
    linksBrowser,
    linksHost,
    linksShell,
    mediaBrowser,
    mediaHost,
    mediaShell,
    pushBrowser,
    pushHost,
    pushShell,
    signInBrowser,
    signInHost,
    signInShell,
} from './hostPorts';
export type { CheckoutImplementations, WebHostAdapter } from './hostPorts';
