import 'fake-indexeddb/auto';
import type { IWebBridgeClient } from '@chatic/bridges';
import { IndexedDBDatabase } from '../databases';
import { IndexedDBAdapter } from '../storages';
import { IndexedDbGlobalSearchSource } from './IndexedDbGlobalSearchSource';
import { NativeGlobalSearchSource } from './NativeGlobalSearchSource';
import type { GlobalCacheContextQuery, GlobalCacheSearchQuery, IGlobalCacheSearchSource } from './types';

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
type JoinFixture = {
    domain: 'join';
    id: string;
    cid: string;
    uid: string;
    channelId: string;
    userId: string;
    readNo: number;
};
type ProfileFixture = {
    domain: 'profile';
    id: string;
    cid: string;
    uid: string;
    sid: string;
    userId: string;
    nick: string;
};
type ChatFixture = {
    domain: 'chat';
    id: string;
    cid: string;
    uid: string;
    channelId: string;
    chatNo: number;
    content: string;
};
type Fixture = ChannelFixture | SiteFixture | JoinFixture | ProfileFixture | ChatFixture;

const FIXTURES: Fixture[] = [
    { domain: 'channel', id: 'ch-1', cid: 'cloud-a', uid: 'user-1', sid: 'site-1', name: 'Lemon Lounge' },
    { domain: 'channel', id: 'ch-2', cid: 'cloud-b', uid: 'user-1', sid: 'site-2', name: 'Other Room' },
    { domain: 'channel', id: 'ch-3', cid: 'cloud-a', uid: 'user-2', sid: 'site-3', name: 'Lemon Secret' },
    { domain: 'channel', id: 'ch-4', cid: 'cloud-b', uid: 'user-1', sid: 'site-4', name: 'Lemon Bistro' },
    { domain: 'site', id: 'site-1', cid: 'cloud-a', uid: 'user-1', name: 'Lemon HQ' },
    { domain: 'site', id: 'site-2', cid: 'cloud-b', uid: 'user-1', name: 'Beta Base' },
    // Same sid string in both clouds — context maps must key by cloud, not by id alone.
    { domain: 'site', id: 'site-1', cid: 'cloud-b', uid: 'user-1', name: 'Beta Annex' },
    { domain: 'join', id: 'join-1', cid: 'cloud-a', uid: 'user-1', channelId: 'ch-1', userId: 'user-1', readNo: 7 },
    // Another member of the SAME channel, cached under MY partition (uid) — read receipts cache
    // every member's cursor, so `uid` alone does not mean "my row". Written after mine on purpose:
    // a map keyed by channelId without a userId check would end up holding this one.
    { domain: 'join', id: 'join-2', cid: 'cloud-a', uid: 'user-1', channelId: 'ch-1', userId: 'user-2', readNo: 99 },
    { domain: 'join', id: 'join-3', cid: 'cloud-a', uid: 'user-2', channelId: 'ch-1', userId: 'user-2', readNo: 55 },
    // Display profiles are per place: the same person can carry a different nick in another place.
    { domain: 'profile', id: 'p1', cid: 'cloud-a', uid: 'user-1', sid: 'site-1', userId: 'user-2', nick: 'Bora' },
    { domain: 'profile', id: 'p2', cid: 'cloud-b', uid: 'user-1', sid: 'site-2', userId: 'user-2', nick: 'B in Beta' },
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
    // Unsent (chatNo 0): newest by insertion order, never eligible as a preview.
    {
        domain: 'chat',
        id: 'chat-pending',
        cid: 'cloud-a',
        uid: 'user-1',
        channelId: 'ch-1',
        chatNo: 0,
        content: 'still sending',
    },
    // ch-4's only cached row is unsent — the case where the guard actually decides the outcome
    // (elsewhere chatNo 0 sorts lowest and loses on ordering alone).
    {
        domain: 'chat',
        id: 'chat-only-pending',
        cid: 'cloud-b',
        uid: 'user-1',
        channelId: 'ch-4',
        chatNo: 0,
        content: 'queued draft',
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

interface ContextExpectation {
    description: string;
    query: GlobalCacheContextQuery;
    /** Only the keys asserted here are checked; `null` means "must be absent from the map". */
    expected: {
        channels?: Record<string, string | null>;
        sites?: Record<string, string | null>;
        joins?: Record<string, number | null>;
        lastChats?: Record<string, string | null>;
        /** key → expected nick, or null when the profile must be absent. */
        profiles?: Record<string, string | null>;
    };
}

const CONTEXT_EXPECTATIONS: ContextExpectation[] = [
    {
        description: 'empty request resolves to empty maps',
        query: { uid: 'user-1', cids: [], channelRefs: [] },
        expected: { channels: {}, sites: {}, joins: {}, lastChats: {}, profiles: {} },
    },
    {
        description: 'resolves channel/place names and my read cursor per cloud',
        query: { uid: 'user-1', cids: ['cloud-a', 'cloud-b'], channelRefs: [] },
        expected: {
            channels: { 'cloud-a:ch-1': 'Lemon Lounge', 'cloud-b:ch-2': 'Other Room' },
            sites: { 'cloud-a:site-1': 'Lemon HQ', 'cloud-b:site-2': 'Beta Base' },
            joins: { 'cloud-a:ch-1': 7 },
        },
    },
    {
        description: 'keys places by cloud so the same sid in two clouds does not collide',
        query: { uid: 'user-1', cids: ['cloud-a', 'cloud-b'], channelRefs: [] },
        expected: { sites: { 'cloud-a:site-1': 'Lemon HQ', 'cloud-b:site-1': 'Beta Annex' } },
    },
    {
        description: "omits another user's channel rows",
        query: { uid: 'user-1', cids: ['cloud-a'], channelRefs: [] },
        expected: { channels: { 'cloud-a:ch-3': null } },
    },
    {
        description: "resolves MY read cursor, not a co-member's cached in the same partition",
        query: { uid: 'user-1', cids: ['cloud-a'], channelRefs: [] },
        expected: { joins: { 'cloud-a:ch-1': 7 } },
    },
    {
        description: 'resolves the newest sent chat per channel, skipping unsent rows',
        query: {
            uid: 'user-1',
            cids: [],
            channelRefs: [
                { cid: 'cloud-a', channelId: 'ch-1' },
                { cid: 'cloud-b', channelId: 'ch-2' },
            ],
        },
        expected: { lastChats: { 'cloud-a:ch-1': 'chat-2', 'cloud-b:ch-2': 'chat-3' } },
    },
    {
        description: 'resolves no last chat for a channel whose only cached row is unsent',
        query: { uid: 'user-1', cids: [], channelRefs: [{ cid: 'cloud-b', channelId: 'ch-4' }] },
        expected: { lastChats: { 'cloud-b:ch-4': null } },
    },
    {
        description: 'deduplicates repeated channel references',
        query: {
            uid: 'user-1',
            cids: [],
            channelRefs: [
                { cid: 'cloud-a', channelId: 'ch-1' },
                { cid: 'cloud-a', channelId: 'ch-1' },
            ],
        },
        expected: { lastChats: { 'cloud-a:ch-1': 'chat-2' } },
    },
    {
        description: 'resolves display profiles per place so a sender can be named',
        query: { uid: 'user-1', cids: ['cloud-a', 'cloud-b'], channelRefs: [] },
        expected: {
            profiles: {
                'cloud-a:site-1:user-2': 'Bora',
                'cloud-b:site-2:user-2': 'B in Beta',
                'cloud-a:site-9:user-2': null,
            },
        },
    },
    {
        description: 'leaves references with no cached row absent from the maps',
        query: { uid: 'user-1', cids: ['cloud-a'], channelRefs: [{ cid: 'cloud-a', channelId: 'ch-missing' }] },
        expected: { channels: { 'cloud-a:ch-missing': null }, lastChats: { 'cloud-a:ch-missing': null } },
    },
    {
        description: 'scopes strictly to the requesting uid',
        query: { uid: 'user-2', cids: ['cloud-a'], channelRefs: [{ cid: 'cloud-a', channelId: 'ch-1' }] },
        expected: {
            channels: { 'cloud-a:ch-3': 'Lemon Secret', 'cloud-a:ch-1': null },
            joins: { 'cloud-a:ch-1': 55 },
            lastChats: { 'cloud-a:ch-1': null },
        },
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

        it.each(CONTEXT_EXPECTATIONS)('resolveContext: $description', async ({ query, expected }) => {
            const context = await source.resolveContext(query);

            Object.entries(expected.channels ?? {}).forEach(([key, name]) => {
                expect(context.channelsByRef[key]?.name ?? null).toBe(name);
            });
            Object.entries(expected.sites ?? {}).forEach(([key, name]) => {
                expect(context.sitesByRef[key]?.name ?? null).toBe(name);
            });
            Object.entries(expected.joins ?? {}).forEach(([key, readNo]) => {
                expect(context.joinsByRef[key]?.readNo ?? null).toBe(readNo);
            });
            Object.entries(expected.lastChats ?? {}).forEach(([key, chatId]) => {
                expect(context.lastChatsByRef[key]?.id ?? null).toBe(chatId);
            });
            Object.entries(expected.profiles ?? {}).forEach(([key, nick]) => {
                expect(context.profilesByRef[key]?.nick ?? null).toBe(nick);
            });

            if (query.cids.length === 0 && query.channelRefs.length === 0) {
                expect(context).toEqual({
                    channelsByRef: {},
                    sitesByRef: {},
                    joinsByRef: {},
                    lastChatsByRef: {},
                    profilesByRef: {},
                });
            }
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

    const joinCtx = buildScopedContext();
    const joinAdapter = new IndexedDBAdapter(db, 'join', joinCtx.provider);
    for (const f of FIXTURES.filter((f): f is JoinFixture => f.domain === 'join')) {
        joinCtx.set(f.cid, f.uid);
        await joinAdapter.save(f.id, {
            id: f.id,
            cid: f.cid,
            channelId: f.channelId,
            userId: f.userId,
            readNo: f.readNo,
        } as any);
    }

    const profileCtx = buildScopedContext();
    const profileAdapter = new IndexedDBAdapter(db, 'profile', profileCtx.provider);
    for (const f of FIXTURES.filter((f): f is ProfileFixture => f.domain === 'profile')) {
        profileCtx.set(f.cid, f.uid);
        await profileAdapter.save(f.id, {
            id: f.id,
            cid: f.cid,
            sid: f.sid,
            uid: f.uid,
            userId: f.userId,
            nick: f.nick,
        } as any);
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

/**
 * Stands in for the native side: `SearchGlobalCacheData` mirrors SQLite `LIKE` semantics, and
 * `FetchAllCacheData` mirrors the per-domain SQL — cid/uid WHERE clauses plus the chat query's
 * `channel_id` + `ORDER BY chat_no DESC` + `LIMIT` (apps/mobile ChatDataSource.ts:46-72).
 */
const mockNativeBridge = () =>
    ({
        request: jest.fn(async (message: { type: string; data: Record<string, any> }) => {
            if (message.type === 'SearchGlobalCacheData') {
                const { keyword, cid, uid } = message.data;
                const kw = String(keyword).toLowerCase();
                const items = FIXTURES.filter(f => {
                    if (uid && f.uid !== uid) return false;
                    if (cid && f.cid !== cid) return false;
                    // join/profile rows have no searchable field
                    if (f.domain === 'join' || f.domain === 'profile') return false;
                    const field = f.domain === 'chat' ? f.content : f.name;
                    return field.toLowerCase().includes(kw);
                }).map(f => ({ ...f, _domain: f.domain }));

                return { type: 'OnSearchGlobalCacheData', success: true, data: { items } };
            }

            if (message.type === 'FetchAllCacheData') {
                const { type, cid, uid, query } = message.data;
                let items: Fixture[] = FIXTURES.filter(f => f.domain === type);
                if (cid) items = items.filter(f => f.cid === cid);
                if (uid) items = items.filter(f => f.uid === uid);
                if (query?.channelId) {
                    items = items.filter(f => 'channelId' in f && f.channelId === query.channelId);
                }
                if (type === 'chat') {
                    items = [...items].sort(
                        (a, b) => ((b as ChatFixture).chatNo ?? 0) - ((a as ChatFixture).chatNo ?? 0)
                    );
                    if (query?.sort === 'asc') items.reverse();
                }
                if (typeof query?.limit === 'number') items = items.slice(0, query.limit);

                return { type: 'OnFetchAllCacheData', success: true, data: { type, cid, uid, items } };
            }

            throw new Error(`unexpected bridge message: ${message.type}`);
        }),
    }) as unknown as IWebBridgeClient;

runContractSuite('native (bridge)', async () => new NativeGlobalSearchSource(mockNativeBridge()));
