import type {
    CacheMetaView,
    ChatMediaCacheItem,
    ChatMediaEntry,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
} from '@chatic/bridge-messages';
import { CHAT_MEDIA_KINDS } from '@chatic/bridge-messages';

import type { DomainChat } from '../../domain';
import type { CacheStorage, ChatMediaQuery, ScopedCacheStorage } from '../ports';
import { CHAT_MEDIA_ENTRIES_VERSION } from '../../domain';
import { ChatLocalDataSource } from './ChatLocalDataSource';
import { chatMediaIndexMarkId, createChatMediaIndexMarks } from './chatMediaIndexMarks';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

type IndexedStorage = CacheStorage<'chat'> & { saveAllCalls: number; fillCalls: number };

const createIndexedChatStorage = (supported: { value: boolean }) => {
    const base = createPartitionedMemoryStorage('chat');
    const wrapped = new Map<CacheStorage<'chat'>, IndexedStorage>();
    const slot: ScopedCacheStorage<'chat'> = {
        forScope: context => {
            const storage = base.forScope(context);
            let indexed = wrapped.get(storage);
            if (!indexed) {
                const entries = new Map<string, ChatMediaEntry[]>();
                const take = (rows: DomainChat[]) =>
                    rows.forEach(row => Array.isArray(row.mediaEntries) && entries.set(row.id, row.mediaEntries));
                const entriesOf = async (channelId: string) => {
                    const rows = (await storage.loadAll({ channelId } as never)) as DomainChat[];
                    return rows
                        .flatMap(chat =>
                            (entries.get(chat.id) ?? []).map(
                                (entry): ChatMediaCacheItem => ({
                                    ...entry,
                                    chatId: chat.id,
                                    chatNo: chat.chatNo,
                                    chat,
                                })
                            )
                        )
                        .sort((a, b) => b.chatNo - a.chatNo || a.idx - b.idx);
                };
                const self: IndexedStorage = {
                    ...storage,
                    saveAllCalls: 0,
                    fillCalls: 0,
                    async save(id, item) {
                        take([item as DomainChat]);
                        return storage.save(id, item);
                    },
                    async saveAll(items) {
                        self.saveAllCalls += 1;
                        take(items as DomainChat[]);
                        return storage.saveAll(items);
                    },
                    async delete(id) {
                        entries.delete(id);
                        return storage.delete(id);
                    },
                    async deleteAll(ids) {
                        ids.forEach(id => entries.delete(id));
                        return storage.deleteAll(ids);
                    },
                    async clearByChannelId(channelId) {
                        const rows = (await storage.loadAll({ channelId } as never)) as DomainChat[];
                        rows.forEach(row => entries.delete(row.id));
                        return storage.clearByChannelId(channelId);
                    },
                    async clearAll() {
                        entries.clear();
                        return storage.clearAll();
                    },
                    canQueryChatMedia: () => supported.value,
                    async loadChatMedia(query: ChatMediaQuery): Promise<ChatMediaPage> {
                        const all = (await entriesOf(query.channelId)).filter(
                            item =>
                                item.kind === query.kind &&
                                (query.cursorNo === undefined || item.chatNo < query.cursorNo)
                        );
                        const head = all.slice(0, query.limit);
                        if (head.length < query.limit) return { items: head, nextCursorNo: null };
                        const boundary = head[head.length - 1].chatNo;
                        const items = all.filter(item => item.chatNo >= boundary);
                        return { items, nextCursorNo: all.some(item => item.chatNo < boundary) ? boundary : null };
                    },
                    async countChatMedia(channelId: string) {
                        const counts = Object.fromEntries(CHAT_MEDIA_KINDS.map(kind => [kind, 0])) as Record<
                            ChatMediaKind,
                            number
                        >;
                        for (const item of await entriesOf(channelId)) counts[item.kind] += 1;
                        return counts;
                    },
                    async saveChatMediaEntries(items: ChatMediaFillItem[], version: number) {
                        self.fillCalls += 1;
                        for (const item of items) {
                            const row = await storage.load(item.chatId);
                            if (row && (row.mediaEntriesVersion ?? 0) < version) entries.set(item.chatId, item.entries);
                        }
                    },
                };
                indexed = self;
                wrapped.set(storage, indexed);
            }
            return indexed;
        },
    };
    return { slot, base };
};

const contextProvider = {
    current: { cid: 'cloud-a', uid: 'me' } as { cid: string; uid: string },
    getContext() {
        return this.current;
    },
    setContext() {
        return undefined;
    },
};

const photo = (id: string) => ({ id, stereo: 'image', status: 'stored' });
const message = (chatNo: number, fields: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: `ch-1:${chatNo}`,
        channelId: 'ch-1',
        chatNo,
        isPending: false,
        isFailed: false,
        createdAtMs: chatNo,
        updatedAtMs: 100,
        content: '',
        ...fields,
    }) as DomainChat;

const roomRows = (): DomainChat[] =>
    Array.from({ length: 30 }, (_, i) => {
        const chatNo = i + 1;
        return message(chatNo, {
            ...(chatNo % 3 === 0 ? { upload$$: [photo(`p${chatNo}a`), photo(`p${chatNo}b`)] as never } : {}),
            ...(chatNo % 5 === 0 ? { content: `see https://e.example/${chatNo}` } : {}),
        });
    });

const setup = (options: { supported?: boolean; routing?: string; validAfter?: () => number } = {}) => {
    const supported = { value: options.supported ?? true };
    const { slot, base } = createIndexedChatStorage(supported);
    const meta = createPartitionedMemoryStorage('meta');
    const marks = createChatMediaIndexMarks(meta, options.routing ?? 'fp-1', options.validAfter);
    const dataSource = new ChatLocalDataSource(contextProvider as never, slot, marks);
    const storage = () => slot.forScope(contextProvider.current) as IndexedStorage;
    const seedLegacy = (rows: DomainChat[]) => base.forScope(contextProvider.current).saveAll(rows);
    return { dataSource, supported, storage, meta, seedLegacy, slot };
};

const walk = async (dataSource: ChatLocalDataSource, kind: ChatMediaKind, limit: number) => {
    const pages: Array<{ refs: string[]; next: number | null }> = [];
    let cursorNo: number | undefined;
    for (;;) {
        const page = await dataSource.listRoomMedia({ channelId: 'ch-1', kind, cursorNo, limit });
        pages.push({ refs: page.items.map(item => item.ref), next: page.nextCursorNo });
        if (page.nextCursorNo === null) return pages;
        cursorNo = page.nextCursorNo;
    }
};

describe('ChatLocalDataSource — media entries on the write path', () => {
    const written = async (setupResult: ReturnType<typeof setup>, id: string) =>
        (await setupResult.storage().load(id))?.mediaEntries;

    it('hands the store the entries of a written message', async () => {
        const s = setup();
        await s.dataSource.cacheWrite(message(1, { upload$$: [photo('u1')] as never, content: 'https://e.example' }));

        expect(await written(s, 'ch-1:1')).toEqual([
            { kind: 'image', idx: 0, ref: 'u1' },
            { kind: 'link', idx: 1, ref: 'https://e.example' },
        ]);
    });

    it('rewrites them from the merged row when an edit changes the link', async () => {
        const s = setup();
        await s.dataSource.cacheWriteMany([message(1, { content: 'https://old.example' })]);
        await s.dataSource.cacheWrite({ id: 'ch-1:1', content: 'now https://new.example', updatedAtMs: 200 });

        expect(await written(s, 'ch-1:1')).toEqual([{ kind: 'link', idx: 0, ref: 'https://new.example' }]);
    });

    it('hands an empty list for a message marked deleted, so the store removes its entries', async () => {
        const s = setup();
        await s.dataSource.cacheWrite(message(1, { upload$$: [photo('u1')] as never }));
        await s.dataSource.cacheWriteMany([{ id: 'ch-1:1', hidden: true, updatedAtMs: 300 } as Partial<DomainChat>]);

        expect(await written(s, 'ch-1:1')).toEqual([]);
    });

    it('keeps the newer entries when an older copy is dropped', async () => {
        const s = setup();
        await s.dataSource.cacheWrite(message(1, { content: 'https://new.example', updatedAtMs: 200 }));
        await s.dataSource.cacheWriteMany([message(1, { content: 'https://old.example', updatedAtMs: 100 })]);

        expect(await written(s, 'ch-1:1')).toEqual([{ kind: 'link', idx: 0, ref: 'https://new.example' }]);
    });
});

describe('ChatLocalDataSource — room media', () => {
    beforeEach(() => {
        contextProvider.current = { cid: 'cloud-a', uid: 'me' };
    });

    it('lists one kind newest first, never splitting a message, and ends with a null cursor', async () => {
        const s = setup();
        await s.dataSource.cacheWriteMany(roomRows());

        const pages = await walk(s.dataSource, 'image', 3);

        expect(pages[0]).toEqual({ refs: ['p30a', 'p30b', 'p27a', 'p27b'], next: 27 });
        expect(pages.flatMap(page => page.refs)).toHaveLength(20);
        expect(pages[pages.length - 1].next).toBeNull();
    });

    it('answers the same pages and counts from plain rows as from the index', async () => {
        const indexed = setup({ supported: true });
        const plain = setup({ supported: false });
        await indexed.dataSource.cacheWriteMany(roomRows());
        await plain.seedLegacy(roomRows());

        for (const kind of CHAT_MEDIA_KINDS) {
            for (const limit of [1, 2, 3, 7, 50]) {
                expect(await walk(plain.dataSource, kind, limit)).toEqual(await walk(indexed.dataSource, kind, limit));
            }
        }
        const expected = { image: 20, video: 0, file: 0, audio: 0, link: 6 };
        expect(await indexed.dataSource.countRoomMedia({ channelId: 'ch-1' })).toEqual(expected);
        expect(await plain.dataSource.countRoomMedia({ channelId: 'ch-1' })).toEqual(expected);
    });

    it('indexes the rows a room already had on its first read, once, and leaves a mark', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());

        expect(await s.dataSource.countRoomMedia({ channelId: 'ch-1' })).toMatchObject({ image: 20, link: 6 });
        const fillsAfterFirst = s.storage().fillCalls;
        expect(fillsAfterFirst).toBeGreaterThan(0);

        await s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'image', limit: 5 });
        expect(s.storage().fillCalls).toBe(fillsAfterFirst);
        expect(await s.meta.forScope(contextProvider.current).load(chatMediaIndexMarkId('ch-1'))).toMatchObject({
            routing: 'fp-1',
        });
    });

    it('runs one indexing for concurrent first reads of a room', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());

        await Promise.all([
            s.dataSource.countRoomMedia({ channelId: 'ch-1' }),
            s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'link', limit: 2 }),
            s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'image', limit: 2 }),
        ]);

        expect(s.storage().fillCalls).toBe(1);
    });

    it('indexes again when the mark was written under older rules', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());
        const stale: CacheMetaView = {
            id: 'chatmedia-indexed:v0:ch-1',
            cid: 'cloud-a',
            uid: 'me',
            syncedAt: 1,
            routing: 'fp-1',
        };
        await s.meta.forScope(contextProvider.current).save(stale.id, stale);

        expect(await s.dataSource.countRoomMedia({ channelId: 'ch-1' })).toMatchObject({ image: 20 });
        expect(s.storage().fillCalls).toBe(1);
    });

    it('does not index again after the meta TTL has passed', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());
        await s.dataSource.countRoomMedia({ channelId: 'ch-1' });
        const now = Date.now();
        const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000);
        try {
            const again = new ChatLocalDataSource(
                contextProvider as never,
                s.slot,
                createChatMediaIndexMarks(s.meta, 'fp-1')
            );
            await again.countRoomMedia({ channelId: 'ch-1' });
        } finally {
            clock.mockRestore();
        }
        expect(s.storage().fillCalls).toBe(1);
    });

    it('indexes again when the routing changed or the cache was cleared since the mark', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());
        await s.dataSource.countRoomMedia({ channelId: 'ch-1' });

        const rerouted = new ChatLocalDataSource(
            contextProvider as never,
            s.slot,
            createChatMediaIndexMarks(s.meta, 'fp-2')
        );
        await rerouted.countRoomMedia({ channelId: 'ch-1' });
        expect(s.storage().fillCalls).toBe(2);

        const clearedAt = Date.now() + 1000;
        const cleared = new ChatLocalDataSource(
            contextProvider as never,
            s.slot,
            createChatMediaIndexMarks(s.meta, 'fp-1', () => clearedAt)
        );
        await cleared.countRoomMedia({ channelId: 'ch-1' });
        expect(s.storage().fillCalls).toBe(3);
    });

    it('fills entries without writing a row: no new cache stamp, no screen woken', async () => {
        const s = setup();
        await s.seedLegacy(roomRows());
        const before = await s.storage().load('ch-1:30');
        const woken = jest.fn();
        const unsubscribe = s.dataSource.observeList({ channelId: 'ch-1', limit: 50 } as never, woken);
        await new Promise(resolve => setTimeout(resolve, 80));
        woken.mockClear();

        await s.dataSource.countRoomMedia({ channelId: 'ch-1' });
        await new Promise(resolve => setTimeout(resolve, 80));
        unsubscribe();

        expect(s.storage().saveAllCalls).toBe(0);
        expect(await s.storage().load('ch-1:30')).toEqual(before);
        expect(woken).not.toHaveBeenCalled();
    });

    it('does not undo a delete mark that lands between the fill’s read and its write', async () => {
        const s = setup();
        await s.seedLegacy([message(1, { upload$$: [photo('u1')] as never, updatedAtMs: 100 })]);
        const storage = s.storage();
        const loadAll = storage.loadAll.bind(storage);
        storage.loadAll = async options => {
            const rows = await loadAll(options);
            storage.loadAll = loadAll;
            await s.dataSource.cacheWriteMany([{ id: 'ch-1:1', hidden: true, hiddenByFeed: true, updatedAtMs: 100 }]);
            return rows;
        };

        expect(await s.dataSource.countRoomMedia({ channelId: 'ch-1' })).toMatchObject({ image: 0 });
        expect(await storage.load('ch-1:1')).toMatchObject({ hidden: true });
    });

    it('stamps the rules version on every write, which is what a fill checks', async () => {
        const s = setup();
        await s.dataSource.cacheWrite(message(1));
        await s.dataSource.cacheWriteMany([message(2)]);

        expect(await s.storage().load('ch-1:1')).toMatchObject({ mediaEntriesVersion: CHAT_MEDIA_ENTRIES_VERSION });
        expect(await s.storage().load('ch-1:2')).toMatchObject({ mediaEntriesVersion: CHAT_MEDIA_ENTRIES_VERSION });
    });

    it('sends a fill nothing for rows already written at the current version', async () => {
        const s = setup();
        await s.dataSource.cacheWriteMany(roomRows());

        await s.dataSource.countRoomMedia({ channelId: 'ch-1' });

        expect(s.storage().fillCalls).toBe(0);
    });

    it('reads plain rows and indexes nothing while the store cannot query the index (no handshake yet)', async () => {
        const s = setup({ supported: false });
        await s.seedLegacy(roomRows());

        const page = await s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'link', limit: 10 });

        expect(page.items.map(item => item.ref)).toEqual([30, 25, 20, 15, 10, 5].map(n => `https://e.example/${n}`));
        expect(page.nextCursorNo).toBeNull();
        expect(s.storage().fillCalls).toBe(0);
        expect(await s.meta.forScope(contextProvider.current).load(chatMediaIndexMarkId('ch-1'))).toBeNull();
    });

    it('answers a read the index fails on from plain rows', async () => {
        const s = setup();
        await s.dataSource.cacheWriteMany(roomRows());
        s.storage().loadChatMedia = async () => null;

        const page = await s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'image', limit: 2 });

        expect(page).toMatchObject({ nextCursorNo: 30 });
        expect(page.items.map(item => item.ref)).toEqual(['p30a', 'p30b']);
    });

    it.each([null, Number.NaN])('reads a %p cursor as "from the newest"', async cursorNo => {
        const s = setup();
        await s.dataSource.cacheWriteMany(roomRows());

        const page = await s.dataSource.listRoomMedia({
            channelId: 'ch-1',
            kind: 'link',
            cursorNo: cursorNo as never,
            limit: 1,
        });

        expect(page.items.map(item => item.chatNo)).toEqual([30]);
    });

    it('attaches the message row to each entry, a link numbered after the two photo slots', async () => {
        const s = setup();
        await s.dataSource.cacheWriteMany(roomRows());

        const [first] = (await s.dataSource.listRoomMedia({ channelId: 'ch-1', kind: 'link', limit: 1 })).items;

        expect(first).toMatchObject({ kind: 'link', idx: 2, chatId: 'ch-1:30', chatNo: 30, chat: { id: 'ch-1:30' } });
    });
});
