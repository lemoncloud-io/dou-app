// The IndexedDB adapter opens a real database in its constructor, so a shim must exist first.
import 'fake-indexeddb/auto';

import type { DataContextProvider } from '@chatic/data';
import { IndexedDBDatabase } from '@chatic/db';

import { indexedDbCache, sharedIndexedDbDatabase } from './indexedDbCache';

const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
const nameOf = (value: unknown) => (value as object).constructor.name;

describe('indexedDbCache', () => {
    it('builds an IndexedDB adapter per domain on the connection it is handed', () => {
        const db = new IndexedDBDatabase();
        const database = jest.fn(() => db);
        const cache = indexedDbCache({ database });

        const storage = cache.storage('channel', context);

        expect(nameOf(storage)).toBe('IndexedDBAdapter');
        expect(database).toHaveBeenCalled();
        expect((storage as unknown as { db: unknown }).db).toBe(db);
    });

    it("gives the chat domain the app's per-channel cap, and leaves it unbounded when none is given", () => {
        const cache = indexedDbCache();

        const capped = cache.storage('chat', context, { maxChatsPerChannel: 5 });
        const unbounded = cache.storage('chat', context);

        expect((capped as unknown as { options: { maxChatsPerChannel?: number } }).options.maxChatsPerChannel).toBe(5);
        expect(
            (unbounded as unknown as { options: { maxChatsPerChannel?: number } }).options.maxChatsPerChannel
        ).toBeUndefined();
    });

    it('searches the same database', () => {
        const db = new IndexedDBDatabase();
        const search = indexedDbCache({ database: () => db }).globalSearch();

        expect(nameOf(search)).toBe('IndexedDbGlobalSearchSource');
        expect((search as unknown as { db: unknown }).db).toBe(db);
    });

    it('shares one page connection between stores that are handed none', () => {
        const first = indexedDbCache().storage('user', context) as unknown as { db: unknown };
        const second = indexedDbCache().storage('site', context) as unknown as { db: unknown };

        expect(first.db).toBe(sharedIndexedDbDatabase());
        expect(second.db).toBe(first.db);
    });
});
