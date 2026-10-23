import {
    classifyWebKey,
    clearWebDatabases,
    clearWebStores,
    formatSize,
    groupWebStorage,
    summarizeWebStorage,
    type WebStorageEnv,
} from './webStorage';

/** A Storage backed by a Map, so tests do not share jsdom's global one. */
const memoryStorage = (entries: Record<string, string> = {}): Storage => {
    const data = new Map(Object.entries(entries));
    return {
        get length() {
            return data.size;
        },
        key: (index: number) => [...data.keys()][index] ?? null,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
        clear: () => data.clear(),
    };
};

type DeleteRequest = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void };

/** An IndexedDB factory whose delete for each name ends the way the test says. */
const fakeIndexedDb = (outcomes: Record<string, 'success' | 'error' | 'blocked'>, listable = true) => {
    const deleteDatabase = jest.fn((name: string) => {
        const request: DeleteRequest = {};
        setTimeout(() => {
            const outcome = outcomes[name] ?? 'success';
            if (outcome === 'success') request.onsuccess?.();
            else if (outcome === 'error') request.onerror?.();
            else request.onblocked?.();
        });
        return request as unknown as IDBOpenDBRequest;
    });
    return {
        deleteDatabase,
        databases: listable ? async () => Object.keys(outcomes).map(name => ({ name, version: 1 })) : undefined,
    };
};

const fakeCaches = (names: string[], failing: string[] = []) => ({
    keys: jest.fn(async () => names),
    delete: jest.fn(async (name: string) => {
        if (failing.includes(name)) throw new Error('nope');
        return true;
    }),
});

describe('classifyWebKey', () => {
    it.each([
        ['@chatic.lemon-token', 'session'],
        ['chatic-cloud-token-cache', 'session'],
        ['chatic-relay-token', 'session'],
        ['chatic-cloud-identities', 'session'],
        ['chatic-cloud-promo-dismissed-at', 'other'],
        ['@chatic/web.log.pending.abc', 'logs'],
        ['@chatic/web.log.alive', 'logs'],
        ['chatic-selected-cloud-id', 'session'],
        ['@chatic/config.ui.theme', 'config'],
        ['@chatic_dev.i18nextLng', 'other'],
        ['chatic-pinned-channels', 'other'],
        ['anything-else', 'other'],
    ])('puts %s in %s', (key, group) => {
        expect(classifyWebKey(key)).toBe(group);
    });
});

describe('groupWebStorage', () => {
    it('groups keys in session, config, other order with summed key + value lengths', () => {
        const storage = memoryStorage({
            'chatic-pinned-channels': '[]',
            'chatic-cloud-token': 'abcd',
            '@chatic/config.ui.theme': 'x',
        });

        expect(groupWebStorage(storage)).toEqual([
            { group: 'session', keys: [{ key: 'chatic-cloud-token', bytes: 22 }], bytes: 22 },
            { group: 'config', keys: [{ key: '@chatic/config.ui.theme', bytes: 24 }], bytes: 24 },
            { group: 'other', keys: [{ key: 'chatic-pinned-channels', bytes: 24 }], bytes: 24 },
        ]);
    });

    it('leaves out a group with no keys', () => {
        expect(groupWebStorage(memoryStorage({ 'chatic-cloud-token': 'a' })).map(g => g.group)).toEqual(['session']);
    });
});

describe('summarizeWebStorage', () => {
    it('reports every store the environment offers', async () => {
        const env: WebStorageEnv = {
            localStorage: memoryStorage({ a: '1' }),
            sessionStorage: memoryStorage({ 'chatic-debug-mode': 'true' }),
            indexedDB: fakeIndexedDb({ ChaticWebCacheDB: 'success' }),
            caches: fakeCaches(['workbox-precache']),
            estimate: async () => ({ usage: 2048 }),
        };

        const summary = await summarizeWebStorage(env);

        expect(summary.sessionStorage).toEqual({ count: 1, bytes: 21 });
        expect(summary.indexedDb).toEqual(['ChaticWebCacheDB']);
        expect(summary.cacheStorage).toEqual(['workbox-precache']);
        expect(summary.usageBytes).toBe(2048);
    });

    it('says null for what the browser cannot list, rather than claiming it is empty', async () => {
        const env: WebStorageEnv = {
            localStorage: memoryStorage(),
            sessionStorage: memoryStorage(),
            indexedDB: fakeIndexedDb({}, false),
        };

        const summary = await summarizeWebStorage(env);

        expect(summary.indexedDb).toBeNull();
        expect(summary.cacheStorage).toBeNull();
        expect(summary.usageBytes).toBeNull();
    });
});

describe('clearWebDatabases', () => {
    it('deletes every database and every cache, and leaves the storages alone', async () => {
        const local = memoryStorage({ 'chatic-cloud-token-cache': '{}' });
        const env: WebStorageEnv = {
            localStorage: local,
            sessionStorage: memoryStorage(),
            indexedDB: fakeIndexedDb({ ChaticWebCacheDB: 'success', other: 'blocked' }),
            caches: fakeCaches(['a', 'b']),
        };

        const result = await clearWebDatabases(env);

        expect(result).toEqual({
            indexedDb: [
                { name: 'ChaticWebCacheDB', outcome: 'deleted' },
                { name: 'other', outcome: 'blocked' },
            ],
            cacheStorage: ['a', 'b'],
        });
        expect(local.length).toBe(1);
    });

    it('deletes the known cache database by name when the browser cannot list databases', async () => {
        const indexedDB = fakeIndexedDb({}, false);
        const env: WebStorageEnv = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), indexedDB };

        const result = await clearWebDatabases(env);

        expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('ChaticWebCacheDB');
        expect(result.indexedDb).toEqual([{ name: 'ChaticWebCacheDB', outcome: 'deleted' }]);
    });

    it('reports only the caches it actually deleted', async () => {
        const env: WebStorageEnv = {
            localStorage: memoryStorage(),
            sessionStorage: memoryStorage(),
            caches: fakeCaches(['a', 'b'], ['b']),
        };

        expect((await clearWebDatabases(env)).cacheStorage).toEqual(['a']);
    });

    it('reports a database whose delete errors as failed', async () => {
        const env: WebStorageEnv = {
            localStorage: memoryStorage(),
            sessionStorage: memoryStorage(),
            indexedDB: fakeIndexedDb({ broken: 'error' }),
        };

        expect((await clearWebDatabases(env)).indexedDb).toEqual([{ name: 'broken', outcome: 'failed' }]);
    });
});

describe('clearWebStores', () => {
    it('empties both storages but keeps the unsent logs', () => {
        const local = memoryStorage({
            'chatic-cloud-token-cache': '{}',
            '@chatic/config.ui.theme': 'x',
            '@chatic/web.log.pending.1': '[]',
        });
        const session = memoryStorage({ 'chatic-debug-mode': 'true' });

        const result = clearWebStores({ localStorage: local, sessionStorage: session });

        expect(result).toEqual({ removedKeys: 3, keptLogKeys: 1 });
        expect(local.key(0)).toBe('@chatic/web.log.pending.1');
        expect(local.length).toBe(1);
        expect(session.length).toBe(0);
    });
});

describe('formatSize', () => {
    it.each([
        [0, '0 B'],
        [999, '999 B'],
        [1234, '1.2 KB'],
        [2_500_000, '2.5 MB'],
    ])('formats %d as %s', (bytes, text) => {
        expect(formatSize(bytes)).toBe(text);
    });
});
