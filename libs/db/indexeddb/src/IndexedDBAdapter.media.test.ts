import 'fake-indexeddb/auto';
import type { ChatMediaEntry } from '@chatic/bridge-messages';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBAdapter } from './IndexedDBAdapter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}

const DB_NAME = 'ChaticWebCacheDB';

const scopeOf = (cid: string, uid: string) => ({ getContext: () => ({ cid, uid }), setContext: () => undefined });

const chat = (id: string, chatNo: number, mediaEntries?: ChatMediaEntry[], extra: Record<string, unknown> = {}) =>
    ({
        id,
        cid: 'c',
        channelId: 'room',
        chatNo,
        isPending: false,
        isFailed: false,
        createdAtMs: chatNo,
        updatedAtMs: chatNo,
        ...(mediaEntries ? { mediaEntries } : {}),
        ...extra,
    }) as any;

const image = (idx: number, ref = `u${idx}`): ChatMediaEntry => ({ kind: 'image', idx, ref });

const rawRecords = (): Promise<any[]> =>
    new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME);
        open.onsuccess = () => {
            const db = open.result;
            const request = db.transaction('cache_store', 'readonly').objectStore('cache_store').getAll();
            request.onsuccess = () => {
                db.close();
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        };
        open.onerror = () => reject(open.error);
    });

const mediaRecordsOf = async (cid: string) =>
    (await rawRecords()).filter(record => record.type === 'chatmedia' && record.cid === cid);

describe('IndexedDBDatabase v3 → v4', () => {
    it('keeps the chat rows, adds the media index, and has no entries yet', async () => {
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open(DB_NAME, 3);
            open.onupgradeneeded = () => {
                const store = open.result.createObjectStore('cache_store', { keyPath: 'key' });
                store.createIndex('type_cid_uid', ['type', 'cid', 'uid']);
                store.createIndex('chat_pagination_index', ['type', 'cid', 'uid', 'channel_id', 'chat_no']);
                store.put({
                    key: 'chat:up:u:room:1',
                    type: 'chat',
                    cid: 'up',
                    uid: 'u',
                    id: 'room:1',
                    channel_id: 'room',
                    chat_no: 1,
                    data: chat('room:1', 1),
                });
            };
            open.onsuccess = () => {
                open.result.close();
                resolve();
            };
            open.onerror = () => reject(open.error);
        });

        const db = new IndexedDBDatabase();
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('up', 'u'));

        expect(await storage.load('room:1')).toMatchObject({ id: 'room:1', chatNo: 1 });
        const indexNames = await new Promise<string[]>(resolve => {
            const open = indexedDB.open(DB_NAME);
            open.onsuccess = () => {
                const names = Array.from(open.result.transaction('cache_store').objectStore('cache_store').indexNames);
                expect(open.result.version).toBe(4);
                open.result.close();
                resolve(names);
            };
        });
        expect(indexNames).toContain('chat_media_index');
        expect(await mediaRecordsOf('up')).toEqual([]);
        expect(await storage.countChatMedia('room')).toEqual({ image: 0, video: 0, file: 0, audio: 0, link: 0 });
    });
});

describe('IndexedDBAdapter — media index records', () => {
    let db: IndexedDBDatabase;
    beforeEach(() => {
        db = new IndexedDBDatabase();
    });

    it('writes a row and its entries in one batch', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('one-batch', 'u'));
        const writeBatch = jest.spyOn(db, 'writeBatch');

        await storage.save('room:1', chat('room:1', 1, [image(0), image(1)]));

        expect(writeBatch).toHaveBeenCalledTimes(1);
        expect(writeBatch.mock.calls[0][0].put?.map(record => record.type)).toEqual(['chat', 'chatmedia', 'chatmedia']);
        expect(writeBatch.mock.calls[0][0].deleteRanges).toHaveLength(1);
    });

    it('commits nothing of a batch when one of its requests fails', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('atomic', 'u'));
        await storage.save('room:1', chat('room:1', 1, [image(0, 'old')]));
        const [oldEntry] = await mediaRecordsOf('atomic');

        await expect(
            db.writeBatch({
                deleteKeys: [oldEntry.key],
                put: [{ ...oldEntry, key: 'new' }, { type: 'chatmedia' } as never],
            })
        ).rejects.toBeDefined();

        expect((await mediaRecordsOf('atomic')).map(record => record.key)).toEqual([oldEntry.key]);
    });

    it('leaves the entries alone for a row written without mediaEntries, and clears them for an empty list', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('absent', 'u'));
        await storage.save('room:1', chat('room:1', 1, [image(0)]));

        await storage.save('room:1', chat('room:1', 1));
        expect(await mediaRecordsOf('absent')).toHaveLength(1);

        await storage.save('room:1', chat('room:1', 1, []));
        expect(await mediaRecordsOf('absent')).toHaveLength(0);
    });

    it('keys entries with NUL after the chat id, so clearing message x:12 leaves x:12:7 and x:120', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('nul', 'u'));
        await storage.saveAll([
            chat('x:12', 12, [image(0, 'a')]),
            chat('x:12:7', 13, [image(0, 'b')]),
            chat('x:120', 14, [image(0, 'c')]),
        ]);

        await storage.save('x:12', chat('x:12', 12, []));

        expect((await mediaRecordsOf('nul')).map(record => record.ref).sort()).toEqual(['b', 'c']);
        expect((await storage.delete('x:12:7'), (await mediaRecordsOf('nul')).map(record => record.ref))).toEqual([
            'c',
        ]);
    });

    it('lists one message’s entries by idx although the reverse cursor hands them the other way', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('order', 'u'));
        await storage.save('room:5', chat('room:5', 5, [image(0), image(1), image(2)]));

        const page = await storage.loadChatMedia({ channelId: 'room', kind: 'image', limit: 10 });

        expect(page?.items.map(item => item.idx)).toEqual([0, 1, 2]);
    });

    it('removes the evicted messages’ entries with them when the channel cap evicts', async () => {
        const storage = new IndexedDBAdapter(db, 'chat', scopeOf('evict', 'u'), { maxChatsPerChannel: 2 });
        await storage.saveAll([1, 2, 3, 4].map(no => chat(`room:${no}`, no, [image(0, `p${no}`)])));

        expect((await mediaRecordsOf('evict')).map(record => record.ref).sort()).toEqual(['p3', 'p4']);
        expect(await storage.countChatMedia('room')).toMatchObject({ image: 2 });
    });
});
