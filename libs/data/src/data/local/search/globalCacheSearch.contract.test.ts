import 'fake-indexeddb/auto';
import type { IWebBridgeClient } from '@chatic/bridges';
import { IndexedDBDatabase } from '../databases';
import { IndexedDBAdapter } from '../storages';
import { IndexedDbGlobalSearchSource } from './IndexedDbGlobalSearchSource';
import { NativeGlobalSearchSource } from './NativeGlobalSearchSource';
import type { GlobalCacheSearchQuery, IGlobalCacheSearchSource } from './types';

/**
 * Shared contract test (ADR-0033 "어댑터 동작 동일성"): the same fixtures and the same
 * expectation table run against both the IndexedDB (web) and native (bridge) search
 * sources. A semantic change to one that isn't mirrored in the other fails here.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

type ChannelFixture = { domain: 'channel'; id: string; cid: string; uid: string; sid: string; name: string };
type SiteFixture = { domain: 'site'; id: string; cid: string; uid: string; name: string };
type ChatFixture = {
    domain: 'chat';
    id: string;
    cid: string;
    uid: string;
    channelId: string;
    chatNo: number;
    content: string;
};
type Fixture = ChannelFixture | SiteFixture | ChatFixture;

const FIXTURES: Fixture[] = [
    { domain: 'channel', id: 'ch-1', cid: 'cloud-a', uid: 'user-1', sid: 'site-1', name: 'Lemon Lounge' },
    { domain: 'channel', id: 'ch-2', cid: 'cloud-b', uid: 'user-1', sid: 'site-2', name: 'Other Room' },
    { domain: 'channel', id: 'ch-3', cid: 'cloud-a', uid: 'user-2', sid: 'site-3', name: 'Lemon Secret' },
    { domain: 'channel', id: 'ch-4', cid: 'cloud-b', uid: 'user-1', sid: 'site-4', name: 'Lemon Bistro' },
    { domain: 'site', id: 'site-1', cid: 'cloud-a', uid: 'user-1', name: 'Lemon HQ' },
    { domain: 'site', id: 'site-2', cid: 'cloud-b', uid: 'user-1', name: 'Beta Base' },
    {
        domain: 'chat',
        id: 'chat-1',
        cid: 'cloud-a',
        uid: 'user-1',
        channelId: 'ch-1',
        chatNo: 1,
        content: 'hello lemon world',
    },
    {
        domain: 'chat',
        id: 'chat-2',
        cid: 'cloud-a',
        uid: 'user-1',
        channelId: 'ch-1',
        chatNo: 2,
        content: 'unrelated message',
    },
    {
        domain: 'chat',
        id: 'chat-3',
        cid: 'cloud-b',
        uid: 'user-1',
        channelId: 'ch-2',
        chatNo: 1,
        content: 'another lemon chat',
    },
];

interface Expectation {
    description: string;
    keyword: string;
    query: GlobalCacheSearchQuery;
    expected: { channels: string[]; sites: string[]; chats: string[] };
}

const EXPECTATIONS: Expectation[] = [
    {
        description: 'blank keyword returns nothing',
        keyword: '   ',
        query: { uid: 'user-1' },
        expected: { channels: [], sites: [], chats: [] },
    },
    {
        description: 'matches case-insensitively across every cloud, excluding other uid rows',
        keyword: 'LEMON',
        query: { uid: 'user-1' },
        expected: { channels: ['ch-1', 'ch-4'], sites: ['site-1'], chats: ['chat-1', 'chat-3'] },
    },
    {
        description: 'narrows to cloud-a when cid is provided',
        keyword: 'lemon',
        query: { uid: 'user-1', cid: 'cloud-a' },
        expected: { channels: ['ch-1'], sites: ['site-1'], chats: ['chat-1'] },
    },
    {
        description: 'narrows to cloud-b when cid is provided',
        keyword: 'lemon',
        query: { uid: 'user-1', cid: 'cloud-b' },
        expected: { channels: ['ch-4'], sites: [], chats: ['chat-3'] },
    },
    {
        description: 'matches channel name only (no cross-field bleed)',
        keyword: 'room',
        query: { uid: 'user-1' },
        expected: { channels: ['ch-2'], sites: [], chats: [] },
    },
    {
        description: 'scopes strictly to the requesting uid',
        keyword: 'lemon',
        query: { uid: 'user-2' },
        expected: { channels: ['ch-3'], sites: [], chats: [] },
    },
];

const sorted = (ids: string[]) => [...ids].sort();

const runContractSuite = (label: string, buildSource: () => Promise<IGlobalCacheSearchSource>) => {
    describe(`global cache search contract — ${label}`, () => {
        let source: IGlobalCacheSearchSource;

        beforeEach(async () => {
            source = await buildSource();
        });

        it.each(EXPECTATIONS)('$description', async ({ keyword, query, expected }) => {
            const result = await source.search(keyword, query);

            expect(sorted(result.channels.map(c => c.id))).toEqual(sorted(expected.channels));
            expect(sorted(result.sites.map(s => s.id))).toEqual(sorted(expected.sites));
            expect(sorted(result.chats.map(c => c.id))).toEqual(sorted(expected.chats));
        });
    });
};

const buildScopedContext = () => {
    let scope = { cid: '', uid: '' };
    return {
        set: (cid: string, uid: string) => {
            scope = { cid, uid };
        },
        provider: {
            getContext: () => scope,
            setContext: (next: { cid: string; uid: string }) => {
                scope = next;
            },
        },
    };
};

runContractSuite('IndexedDB (web)', async () => {
    const db = new IndexedDBDatabase();

    const channelCtx = buildScopedContext();
    const channelAdapter = new IndexedDBAdapter(db, 'channel', channelCtx.provider);
    for (const f of FIXTURES.filter((f): f is ChannelFixture => f.domain === 'channel')) {
        channelCtx.set(f.cid, f.uid);
        await channelAdapter.save(f.id, { id: f.id, cid: f.cid, sid: f.sid, name: f.name } as any);
    }

    const siteCtx = buildScopedContext();
    const siteAdapter = new IndexedDBAdapter(db, 'site', siteCtx.provider);
    for (const f of FIXTURES.filter((f): f is SiteFixture => f.domain === 'site')) {
        siteCtx.set(f.cid, f.uid);
        await siteAdapter.save(f.id, { id: f.id, cid: f.cid, name: f.name } as any);
    }

    const chatCtx = buildScopedContext();
    const chatAdapter = new IndexedDBAdapter(db, 'chat', chatCtx.provider);
    for (const f of FIXTURES.filter((f): f is ChatFixture => f.domain === 'chat')) {
        chatCtx.set(f.cid, f.uid);
        await chatAdapter.save(f.id, {
            id: f.id,
            cid: f.cid,
            channelId: f.channelId,
            chatNo: f.chatNo,
            content: f.content,
        } as any);
    }

    return new IndexedDbGlobalSearchSource(db);
});

runContractSuite('native (bridge)', async () => {
    const bridge = {
        request: jest.fn(async (message: { data: { keyword: string; cid?: string; uid?: string } }) => {
            const { keyword, cid, uid } = message.data;
            const kw = keyword.toLowerCase();
            const items = FIXTURES.filter(f => {
                if (uid && f.uid !== uid) return false;
                if (cid && f.cid !== cid) return false;
                const field = f.domain === 'chat' ? f.content : f.name;
                return field.toLowerCase().includes(kw);
            }).map(f => ({ ...f, _domain: f.domain }));

            return { type: 'OnSearchGlobalCacheData', success: true, data: { items } };
        }),
    } as unknown as IWebBridgeClient;

    return new NativeGlobalSearchSource(bridge);
});
