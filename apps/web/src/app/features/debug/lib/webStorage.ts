import { runtime } from '@chatic/runtime-react';
import { BridgeStorageChannel, shellKeepsStorageMedium, webClient } from '@chatic/bridges';
import { asDomStorage, WebStore } from '@chatic/storage';

export type WebKeyGroup = 'session' | 'config' | 'logs' | 'other';

export interface WebStorageKey {
    key: string;
    bytes: number;
}

export interface WebStorageGroup {
    group: WebKeyGroup;
    keys: WebStorageKey[];
    bytes: number;
}

export interface WebStorageSummary {
    local: WebStorageGroup[];
    sessionStorage: { count: number; bytes: number };
    indexedDb: string[] | null;
    cacheStorage: string[] | null;
    usageBytes: number | null;
}

export interface WebStorageEnv {
    localStorage: Storage;
    sessionStorage: Storage;
    indexedDB?: Pick<IDBFactory, 'deleteDatabase'> & { databases?: () => Promise<IDBDatabaseInfo[]> };
    caches?: Pick<CacheStorage, 'keys' | 'delete'>;
    estimate?: () => Promise<StorageEstimate>;
    clearVault?: () => Promise<boolean>;
}

export interface WebDatabasesClearResult {
    indexedDb: { name: string; outcome: 'deleted' | 'blocked' | 'failed' }[];
    cacheStorage: string[];
}

export interface WebStoresClearResult {
    removedKeys: number;
    keptLogKeys: number;
}

const GROUP_ORDER: readonly WebKeyGroup[] = ['session', 'config', 'logs', 'other'];

const CONFIG_PREFIX = '@chatic/config.';
const LOG_PREFIX = '@chatic/web.log.';
const LANGUAGE_SUFFIX = '.i18nextLng';
const KNOWN_INDEXED_DB = 'ChaticWebCacheDB';

export const classifyWebKey = (key: string): WebKeyGroup => {
    if (key.startsWith(CONFIG_PREFIX)) return 'config';
    if (key.startsWith(LOG_PREFIX)) return 'logs';
    if (key.startsWith('@')) return key.endsWith(LANGUAGE_SUFFIX) ? 'other' : 'session';
    if (runtime.session.isSessionKey(key)) return 'session';
    return 'other';
};

const entriesOf = (storage: Storage): WebStorageKey[] => {
    const entries: WebStorageKey[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key == null) continue;
        entries.push({ key, bytes: key.length + (storage.getItem(key)?.length ?? 0) });
    }
    return entries;
};

export const groupWebStorage = (storage: Storage): WebStorageGroup[] => {
    const entries = entriesOf(storage).sort((a, b) => a.key.localeCompare(b.key));
    return GROUP_ORDER.map(group => {
        const keys = entries.filter(entry => classifyWebKey(entry.key) === group);
        return { group, keys, bytes: keys.reduce((sum, entry) => sum + entry.bytes, 0) };
    }).filter(group => group.keys.length > 0);
};

const listIndexedDb = async (env: WebStorageEnv): Promise<string[] | null> => {
    if (!env.indexedDB?.databases) return null;
    try {
        const infos = await env.indexedDB.databases();
        return infos.map(info => info.name).filter((name): name is string => !!name);
    } catch {
        return null;
    }
};

export const summarizeWebStorage = async (env: WebStorageEnv): Promise<WebStorageSummary> => {
    const sessionEntries = entriesOf(env.sessionStorage);
    let usageBytes: number | null = null;
    try {
        usageBytes = (await env.estimate?.())?.usage ?? null;
    } catch {
        usageBytes = null;
    }
    let cacheStorage: string[] | null = null;
    try {
        cacheStorage = env.caches ? await env.caches.keys() : null;
    } catch {
        cacheStorage = null;
    }
    return {
        local: groupWebStorage(env.localStorage),
        sessionStorage: {
            count: sessionEntries.length,
            bytes: sessionEntries.reduce((sum, entry) => sum + entry.bytes, 0),
        },
        indexedDb: await listIndexedDb(env),
        cacheStorage,
        usageBytes,
    };
};

const deleteDatabase = (
    factory: NonNullable<WebStorageEnv['indexedDB']>,
    name: string
): Promise<WebDatabasesClearResult['indexedDb'][number]> =>
    new Promise(resolve => {
        try {
            const request = factory.deleteDatabase(name);
            request.onsuccess = () => resolve({ name, outcome: 'deleted' });
            request.onerror = () => resolve({ name, outcome: 'failed' });
            request.onblocked = () => resolve({ name, outcome: 'blocked' });
        } catch {
            resolve({ name, outcome: 'failed' });
        }
    });

export const clearWebDatabases = async (env: WebStorageEnv): Promise<WebDatabasesClearResult> => {
    const names = (await listIndexedDb(env)) ?? (env.indexedDB ? [KNOWN_INDEXED_DB] : []);
    const factory = env.indexedDB;
    const indexedDb = factory ? await Promise.all(names.map(name => deleteDatabase(factory, name))) : [];

    const cacheStorage: string[] = [];
    const cacheApi = env.caches;
    if (cacheApi) {
        try {
            const cacheNames = await cacheApi.keys();
            const deleted = await Promise.all(cacheNames.map(name => cacheApi.delete(name).catch(() => false)));
            cacheNames.forEach((name, i) => deleted[i] && cacheStorage.push(name));
        } catch {
            // Nothing listed means nothing reported; a Cache Storage failure must not stop the wipe.
        }
    }
    return { indexedDb, cacheStorage };
};

const clearStore = (storage: Storage): { removed: number; kept: number } => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key != null) keys.push(key);
    }
    const doomed = keys.filter(key => !key.startsWith(LOG_PREFIX));
    doomed.forEach(key => storage.removeItem(key));
    return { removed: doomed.length, kept: keys.length - doomed.length };
};

export const clearWebStores = (env: WebStorageEnv): WebStoresClearResult => {
    const local = clearStore(env.localStorage);
    const session = clearStore(env.sessionStorage);
    return { removedKeys: local.removed + session.removed, keptLogKeys: local.kept + session.kept };
};

export const browserWebStorageEnv = (): WebStorageEnv => ({
    localStorage: asDomStorage(WebStore.local()),
    sessionStorage: asDomStorage(WebStore.session()),
    indexedDB: typeof indexedDB !== 'undefined' ? indexedDB : undefined,
    caches: typeof caches !== 'undefined' ? caches : undefined,
    estimate: navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined,
    clearVault: shellKeepsStorageMedium('nativeSecure')
        ? () => new BridgeStorageChannel(webClient, 'nativeSecure').clear()
        : undefined,
});

export const formatSize = (bytes: number): string => {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
};
