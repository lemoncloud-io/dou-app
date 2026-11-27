import * as db from '.';

describe('@chatic/db', () => {
    it('keeps every value its entry exported before the db family split', () => {
        expect(Object.keys(db).sort()).toEqual([
            'BaseDbAdapter',
            'CHAT_PAGINATION_INDEX',
            'ChatQueryExecutor',
            'IndexedDBAdapter',
            'IndexedDBDatabase',
            'IndexedDbGlobalSearchSource',
            'NativeCacheMetricsSource',
            'NativeDBAdapter',
            'NativeGlobalSearchSource',
            'TYPE_CID_UID_INDEX',
            'UNSENT_CHAT_NO',
            'WebStorageAdapter',
            'getNativeCacheMetrics',
            'isQuotaExceededError',
            'recordNativeCacheOperation',
            'resetNativeCacheMetrics',
        ]);
    });

    it('keeps a WebStorageAdapter over a DOM Storage, in one JSON value per partition', async () => {
        sessionStorage.clear();
        const scope = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
        const table = new db.WebStorageAdapter(sessionStorage, 'invitecloud', scope);

        await table.save('a', { id: 'a', cid: 'a', name: 'A' } as never);

        expect(sessionStorage.length).toBe(1);
        const key = sessionStorage.key(0) ?? '';
        expect(key.startsWith('chatic-cache:invitecloud:')).toBe(true);
        expect(Object.keys(JSON.parse(sessionStorage.getItem(key) ?? '{}'))).toEqual(['a']);
    });
});
