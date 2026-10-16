/**
 * The web half of the storage screen: what this page keeps in the browser (or the app's WebView),
 * grouped so a reader can tell the session from settings from leftovers, and a wipe of all of it but
 * the unsent logs.
 *
 * Inside the app this is only half of what the device holds — the chat cache and the invited-cloud
 * list live in the native shell, which reports its own half. Clearing one side used to leave the
 * other, and a stale leftover is exactly what the storage screen exists to rule out.
 *
 * Sizes are string lengths (key + value), not encoded bytes, to match what the shell reports for its
 * half: the screen compares entries, it does not account for disk.
 */

/** Which part of the app a localStorage key belongs to. */
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
    /** localStorage, one entry per group that has keys, in `GROUP_ORDER`. */
    local: WebStorageGroup[];
    sessionStorage: { count: number; bytes: number };
    /** Database names; null when this browser cannot list them. */
    indexedDb: string[] | null;
    /** Cache Storage names; null when the API is missing (a non-secure origin). */
    cacheStorage: string[] | null;
    /** The origin's total as the browser estimates it, null when it will not say. */
    usageBytes: number | null;
}

/** What `clearWebStorage` touches. Injected so tests run without a browser. */
export interface WebStorageEnv {
    localStorage: Storage;
    sessionStorage: Storage;
    indexedDB?: Pick<IDBFactory, 'deleteDatabase'> & { databases?: () => Promise<IDBDatabaseInfo[]> };
    caches?: Pick<CacheStorage, 'keys' | 'delete'>;
    estimate?: () => Promise<StorageEstimate>;
}

export interface WebDatabasesClearResult {
    /** Each database and how its delete ended. `blocked` still deletes once the page reloads. */
    indexedDb: { name: string; outcome: 'deleted' | 'blocked' | 'failed' }[];
    /** The Cache Storage entries actually deleted. */
    cacheStorage: string[];
}

export interface WebStoresClearResult {
    /** Keys removed from localStorage and sessionStorage together. */
    removedKeys: number;
    /** Unsent-log keys left in place. */
    keptLogKeys: number;
}

const GROUP_ORDER: readonly WebKeyGroup[] = ['session', 'config', 'logs', 'other'];

/** `@chatic/config`'s own lane. Under the `@` prefix too, so it is checked first. */
const CONFIG_PREFIX = '@chatic/config.';
/**
 * The web log pipeline: unsent upload batches, their heartbeats and the crash sentinel. Under the `@`
 * prefix too. A wipe keeps them — they are the evidence for whatever the wipe is being used to debug,
 * and they are no copy of server data, the same reason the shell's log queue is never cleared.
 */
const LOG_PREFIX = '@chatic/web.log.';
/** i18next's language key sits under the SDK's `@` prefix but is a UI choice, not a credential. */
const LANGUAGE_SUFFIX = '.i18nextLng';
/**
 * The session's own keys: lemon-web-core's token bundle (`@<project>.*`), and the relay and cloud
 * tokens, the per-cloud token cache, the selection and the invited-cloud bundle the runtime keeps
 * beside it. A stale entry in any of these decides which cloud and account the app resumes as.
 */
const SESSION_PREFIXES = ['chatic-relay-', 'chatic-selected-'] as const;
// Cloud keys by name: `chatic-cloud-promo-dismissed-at` shares the prefix and is a UI dismissal.
const SESSION_KEYS = new Set([
    'chatic-cloud-token',
    'chatic-cloud-delegation-token',
    'chatic-cloud-token-cache',
    'chatic-cloud-identities',
    'chatic-invited-clouds',
    'chatic-recent-clouds',
    'chatic-delegator-id',
    'chatic-oauth-provider',
]);

/** The IndexedDB cache the browser build uses; listed by name where `databases()` is missing. */
const KNOWN_INDEXED_DB = 'ChaticWebCacheDB';

export const classifyWebKey = (key: string): WebKeyGroup => {
    if (key.startsWith(CONFIG_PREFIX)) return 'config';
    if (key.startsWith(LOG_PREFIX)) return 'logs';
    if (key.startsWith('@')) return key.endsWith(LANGUAGE_SUFFIX) ? 'other' : 'session';
    if (SESSION_KEYS.has(key) || SESSION_PREFIXES.some(prefix => key.startsWith(prefix))) return 'session';
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
            // An open connection that ignores `versionchange` holds the delete until it closes. The
            // reload that follows a wipe closes it, so this is reported and not waited on.
            request.onblocked = () => resolve({ name, outcome: 'blocked' });
        } catch {
            resolve({ name, outcome: 'failed' });
        }
    });

/**
 * The asynchronous half of a wipe: every IndexedDB database and every Cache Storage entry. Run it
 * before `clearWebStores`, so that nothing awaits between emptying the storages and leaving the page.
 */
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
    // Collected first: removing during the walk shifts the indices under it.
    doomed.forEach(key => storage.removeItem(key));
    return { removed: doomed.length, kept: keys.length - doomed.length };
};

/**
 * The synchronous half: both web storages, all but the unsent logs. That includes the session, so the
 * next load starts signed out — a sign-in that survived would carry the cached cloud tokens with it.
 *
 * Synchronous on purpose. The app keeps running until the page goes, and a token refresh or a store
 * write that lands between this and the navigation would put session state straight back; with no
 * `await` in between, nothing else runs before the caller navigates.
 */
export const clearWebStores = (env: WebStorageEnv): WebStoresClearResult => {
    const local = clearStore(env.localStorage);
    const session = clearStore(env.sessionStorage);
    return { removedKeys: local.removed + session.removed, keptLogKeys: local.kept + session.kept };
};

/** The live browser, for the screen. Kept out of the functions above so they stay testable. */
export const browserWebStorageEnv = (): WebStorageEnv => ({
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    indexedDB: typeof indexedDB !== 'undefined' ? indexedDB : undefined,
    caches: typeof caches !== 'undefined' ? caches : undefined,
    estimate: navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined,
});

/** `1234` → `1.2 KB`. Decimal units: the numbers are approximate lengths, not disk blocks. */
export const formatSize = (bytes: number): string => {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
};
