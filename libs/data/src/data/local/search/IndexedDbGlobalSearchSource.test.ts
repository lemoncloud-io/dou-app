import 'fake-indexeddb/auto';
import { IndexedDBDatabase } from '../databases';
import { IndexedDBAdapter } from '../storages';
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
});
