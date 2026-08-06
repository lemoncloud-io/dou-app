import 'fake-indexeddb/auto';
import { IndexedDBDatabase } from '../databases';
import { IndexedDBAdapter } from '../storages';
import { ProfileLocalDataSourceV2 } from '../data-sources-v2';
import { IndexedDbGlobalSearchSource } from './IndexedDbGlobalSearchSource';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

const contextFor = (cid: string, uid: string) => ({
    getContext: () => ({ cid, uid }),
    setContext: () => undefined,
});

describe('IndexedDbGlobalSearchSource', () => {
    let db: IndexedDBDatabase;
    let source: IndexedDbGlobalSearchSource;

    beforeEach(async () => {
        db = new IndexedDBDatabase();
        source = new IndexedDbGlobalSearchSource(db);

        const channelCloudA = new IndexedDBAdapter(db, 'channel', contextFor('cloud-a', 'user-1'));
        const channelCloudB = new IndexedDBAdapter(db, 'channel', contextFor('cloud-b', 'user-1'));
        const channelOtherUser = new IndexedDBAdapter(db, 'channel', contextFor('cloud-a', 'user-2'));
        const siteCloudA = new IndexedDBAdapter(db, 'site', contextFor('cloud-a', 'user-1'));
        const chatCloudA = new IndexedDBAdapter(db, 'chat', contextFor('cloud-a', 'user-1'));

        await channelCloudA.save('ch-1', { id: 'ch-1', cid: 'cloud-a', sid: 'site-1', name: 'Lemon Lounge' } as any);
        await channelCloudB.save('ch-2', { id: 'ch-2', cid: 'cloud-b', sid: 'site-2', name: 'Other Room' } as any);
        await channelOtherUser.save('ch-3', {
            id: 'ch-3',
            cid: 'cloud-a',
            sid: 'site-3',
            name: 'Lemon Secret',
        } as any);
        await siteCloudA.save('site-1', { id: 'site-1', cid: 'cloud-a', name: 'Lemon HQ' } as any);
        // Same sid string in another cloud — the context maps must not let these collide.
        const siteCloudB = new IndexedDBAdapter(db, 'site', contextFor('cloud-b', 'user-1'));
        await siteCloudB.save('site-1', { id: 'site-1', cid: 'cloud-b', name: 'Other HQ' } as any);
        await siteCloudB.save('site-2', { id: 'site-2', cid: 'cloud-b', name: 'Other Place' } as any);

        const joinCloudA = new IndexedDBAdapter(db, 'join', contextFor('cloud-a', 'user-1'));
        // A co-member's join row lands in MY partition (read receipts cache every member).
        const joinCoMember = new IndexedDBAdapter(db, 'join', contextFor('cloud-a', 'user-1'));
        await joinCloudA.save('join-1', {
            id: 'join-1',
            cid: 'cloud-a',
            channelId: 'ch-1',
            userId: 'user-1',
            readNo: 7,
        } as any);
        await joinCoMember.save('join-2', {
            id: 'join-2',
            cid: 'cloud-a',
            channelId: 'ch-1',
            userId: 'user-2',
            readNo: 99,
        } as any);

        const profileCloudA = new IndexedDBAdapter(db, 'profile', contextFor('cloud-a', 'user-1'));
        await profileCloudA.save('site-1@user-2', {
            id: 'site-1@user-2',
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'user-1',
            userId: 'user-2',
            nick: 'Bora',
            thumbnail: 'data:image/png;base64,BBB',
        } as any);

        await chatCloudA.save('chat-1', {
            id: 'chat-1',
            cid: 'cloud-a',
            channelId: 'ch-1',
            chatNo: 1,
            content: 'hello lemon world',
        } as any);
        await chatCloudA.save('chat-2', {
            id: 'chat-2',
            cid: 'cloud-a',
            channelId: 'ch-1',
            chatNo: 2,
            content: 'unrelated message',
        } as any);
        // Unsent row: highest by insertion, lowest by chat_no — must never win the preview.
        await chatCloudA.save('chat-pending', {
            id: 'chat-pending',
            cid: 'cloud-a',
            channelId: 'ch-1',
            chatNo: 0,
            content: 'still sending',
        } as any);
    });

    it('returns empty result for a blank keyword', async () => {
        const result = await source.search('   ', { uid: 'user-1' });
        expect(result).toEqual({ channels: [], sites: [], chats: [] });
    });

    it('matches channel/site names and chat content case-insensitively across clouds', async () => {
        const result = await source.search('LEMON', { uid: 'user-1' });

        expect(result.channels.map(c => c.id)).toEqual(['ch-1']);
        expect(result.sites.map(s => s.id)).toEqual(['site-1']);
        expect(result.chats.map(c => c.id)).toEqual(['chat-1']);
    });

    it('excludes results belonging to a different uid', async () => {
        const result = await source.search('lemon', { uid: 'user-1' });
        expect(result.channels.some(c => c.id === 'ch-3')).toBe(false);
    });

    it('scans every cloud partition when cid is omitted', async () => {
        const result = await source.search('room', { uid: 'user-1' });
        expect(result.channels.map(c => c.id)).toEqual(['ch-2']);
    });

    it('narrows to a single cloud when cid is provided', async () => {
        const result = await source.search('lemon', { uid: 'user-1', cid: 'cloud-a' });
        expect(result.channels.map(c => c.id)).toEqual(['ch-1']);

        const scoped = await source.search('lemon', { uid: 'user-1', cid: 'cloud-b' });
        expect(scoped.channels).toEqual([]);
    });

    describe('resolveContext', () => {
        it('returns empty maps without touching the db for an empty request', async () => {
            const context = await source.resolveContext({ uid: 'user-1', cids: [], channelRefs: [] });
            expect(context).toEqual({
                channelsByRef: {},
                sitesByRef: {},
                joinsByRef: {},
                lastChatsByRef: {},
                profilesByRef: {},
            });
        });

        it('resolves channels, places, my join and the newest chat across clouds', async () => {
            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a', 'cloud-b'],
                channelRefs: [{ cid: 'cloud-a', channelId: 'ch-1' }],
            });

            expect(context.channelsByRef['cloud-a:ch-1'].name).toBe('Lemon Lounge');
            expect(context.channelsByRef['cloud-b:ch-2'].name).toBe('Other Room');
            expect(context.sitesByRef['cloud-a:site-1'].name).toBe('Lemon HQ');
            expect(context.joinsByRef['cloud-a:ch-1'].readNo).toBe(7);
            expect(context.lastChatsByRef['cloud-a:ch-1'].id).toBe('chat-2');
        });

        it('keys places by cloud so the same sid in two clouds does not collide', async () => {
            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a', 'cloud-b'],
                channelRefs: [],
            });

            expect(context.sitesByRef['cloud-a:site-1'].name).toBe('Lemon HQ');
            expect(context.sitesByRef['cloud-b:site-1'].name).toBe('Other HQ');
        });

        it("resolves my join row, not a co-member's in the same partition", async () => {
            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a'],
                channelRefs: [],
            });

            expect(context.joinsByRef['cloud-a:ch-1'].readNo).toBe(7);
            expect(Object.keys(context.joinsByRef)).toEqual(['cloud-a:ch-1']);
        });

        it("resolves a member's display profile per place, for naming a message sender", async () => {
            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a'],
                channelRefs: [],
            });

            expect(context.profilesByRef['cloud-a:site-1:user-2']).toMatchObject({
                nick: 'Bora',
                thumbnail: 'data:image/png;base64,BBB',
            });
        });

        it('finds a profile written the way the app writes it (real write path, not a hand-made row)', async () => {
            // Guards the seam that decides whether a search result can name its sender: the write
            // path derives the row's `uid` from `userId` and stores it under the CACHE OWNER's
            // partition, and the read path keys by (cid, sid, member). A hand-seeded fixture can
            // agree with the reader while the real writer disagrees, so go through the data source.
            const storage = new IndexedDBAdapter(db, 'profile', contextFor('cloud-a', 'user-1'));
            const dataSource = new ProfileLocalDataSourceV2(contextFor('cloud-a', 'user-1') as any, storage as any);
            await dataSource.cacheWrite({ siteId: 'site-1', userId: 'member-9', nick: 'Written' } as any);

            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a'],
                channelRefs: [],
            });

            expect(context.profilesByRef['cloud-a:site-1:member-9']?.nick).toBe('Written');
        });

        it('leaves a reference absent from the maps when the cache has no row for it', async () => {
            const context = await source.resolveContext({
                uid: 'user-1',
                cids: ['cloud-a'],
                channelRefs: [{ cid: 'cloud-a', channelId: 'ch-missing' }],
            });

            expect(context.channelsByRef['cloud-a:ch-missing']).toBeUndefined();
            expect(context.lastChatsByRef['cloud-a:ch-missing']).toBeUndefined();
        });
    });
});
