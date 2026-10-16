import { LOG_CAPACITY, LOG_DATA_LIMIT, LogStore } from './logStore';

describe('LogStore', () => {
    it('numbers lines from 1 and filters by cursor, source, type and text', () => {
        const store = new LogStore();
        store.append({ source: 'web→shell', type: 'FetchCacheData', refId: 'a', data: { type: 'chat' } });
        store.append({ source: 'shell→web', type: 'OnFetchCacheData', refId: 'a' });
        store.append({ source: 'console', type: 'warn', data: ['slow load'] });

        expect(store.query().map(entry => entry.seq)).toEqual([1, 2, 3]);
        expect(store.query({ since: 1 }).map(entry => entry.seq)).toEqual([2, 3]);
        expect(store.query({ source: ['console'] }).map(entry => entry.seq)).toEqual([3]);
        expect(store.query({ type: 'OnFetchCacheData' }).map(entry => entry.seq)).toEqual([2]);
        expect(store.query({ text: 'SLOW' }).map(entry => entry.seq)).toEqual([3]);
    });

    it(`keeps the newest ${LOG_CAPACITY} lines`, () => {
        const store = new LogStore();
        for (let i = 0; i < LOG_CAPACITY + 5; i++) store.append({ source: 'tool', type: 'x' });

        const lines = store.query();
        expect(lines).toHaveLength(LOG_CAPACITY);
        expect(lines[0].seq).toBe(6);
    });

    it('cuts data past the size limit and says so', () => {
        const store = new LogStore();
        const line = store.append({ source: 'console', type: 'log', data: 'x'.repeat(LOG_DATA_LIMIT * 2) });

        expect(line.truncated).toBe(true);
        expect((line.data as string).length).toBe(LOG_DATA_LIMIT);
    });

    it('masks credentials as it records them', () => {
        const store = new LogStore();
        const line = store.append({
            source: 'shell→web',
            type: 'OnOAuthLogin',
            data: { result: { idToken: 'eyJhbGciOiJSUzI1NiJ9.payload' } },
        });

        expect(line.data).toEqual({ result: { idToken: 'eyJhbG…(28)' } });
    });

    it('clears without restarting the count, so an older cursor still means "after that"', () => {
        const store = new LogStore();
        store.append({ source: 'tool' });
        store.clear();
        const next = store.append({ source: 'tool' });

        expect(next.seq).toBe(2);
        expect(store.query()).toEqual([next]);
    });
    it('changes its version with every line and every clear, and finds text in lines recorded earlier', () => {
        const store = new LogStore();
        const start = store.version;
        store.append({ source: 'console', type: 'log', data: ['Hello there'] });
        expect(store.query({ text: 'hello' })).toHaveLength(1);
        store.clear();

        expect(store.version).toBe(start + 2);
        expect(store.query({ text: 'hello' })).toEqual([]);
    });
});
