import 'fake-indexeddb/auto';

import { createIndexedDBAdapter } from './indexedDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// fake-indexeddb는 환경에 따라 structuredClone이 없으면 put/get 과정에서 실패할 수 있다.
if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

let scopeSequence = 0;

const nextCid = (prefix: string) => `${prefix}-${++scopeSequence}`;

const chat = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    cid: 'cloud-main',
    channelId: 'channel-main',
    text: `chat-${id}`,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
});

const user = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    cid: 'cloud-main',
    name: `user-${id}`,
    ...overrides,
});

const sortById = <T extends { id?: string }>(items: T[]) =>
    [...items].sort((left, right) => (left.id || '').localeCompare(right.id || ''));

describe('createIndexedDBAdapter', () => {
    it('should pass load operations', async () => {
        // 같은 type/cid 범위의 데이터만 조회되고, 다른 cid/type 데이터는 섞이지 않아야 한다.
        const cid = nextCid('load');
        const chatDB = createIndexedDBAdapter('chat', cid);
        const otherChatDB = createIndexedDBAdapter('chat', `${cid}-other`);
        const userDB = createIndexedDBAdapter('user', cid);

        expect(await chatDB.load('missing')).toBeNull();
        expect(await chatDB.loadAll()).toEqual([]);

        await chatDB.save('L00001', chat('L00001', { text: 'load-1' }) as any);
        await chatDB.saveAll([chat('L00002', { text: 'load-2' }), chat('L00003', { text: 'load-3' })] as any);
        await otherChatDB.save('L00001', chat('L00001', { text: 'other-cid' }) as any);
        await userDB.save('L00001', user('L00001', { name: 'other-type' }) as any);

        expect(await chatDB.load('L00001')).toEqual(chat('L00001', { text: 'load-1' }));
        expect(sortById(await chatDB.loadAll())).toEqual(
            sortById([
                chat('L00001', { text: 'load-1' }),
                chat('L00002', { text: 'load-2' }),
                chat('L00003', { text: 'load-3' }),
            ])
        );
        expect(await otherChatDB.loadAll()).toEqual([chat('L00001', { text: 'other-cid' })]);
        expect(await userDB.loadAll()).toEqual([user('L00001', { name: 'other-type' })]);
    });

    it('should pass save and update operations', async () => {
        // save/saveAll은 현재 scope에만 반영되고, 다른 scope 데이터는 그대로 유지해야 한다.
        const cid = nextCid('save');
        const chatDB = createIndexedDBAdapter('chat', cid);
        const otherChatDB = createIndexedDBAdapter('chat', `${cid}-other`);
        const otherUserDB = createIndexedDBAdapter('user', cid);

        expect(await chatDB.saveAll([])).toEqual([]);

        const created = chat('S00001', { text: 'created' });
        const updated = chat('S00001', { text: 'updated' });
        const batch = [chat('S00002', { text: 'batch-2' }), chat('S00003', { text: 'batch-3' })];

        expect(await chatDB.save('S00001', created as any)).toEqual(created);
        expect(await chatDB.save('S00001', updated as any)).toEqual(updated);
        expect(await chatDB.saveAll(batch as any)).toEqual(batch);

        await otherChatDB.save('KEEP-CID', chat('KEEP-CID', { text: 'keep-other-cid' }) as any);
        await otherUserDB.save('KEEP-TYPE', user('KEEP-TYPE', { name: 'keep-other-type' }) as any);

        expect(sortById(await chatDB.loadAll())).toEqual(sortById([updated, ...batch]));
        expect(await otherChatDB.loadAll()).toEqual([chat('KEEP-CID', { text: 'keep-other-cid' })]);
        expect(await otherUserDB.loadAll()).toEqual([user('KEEP-TYPE', { name: 'keep-other-type' })]);
    });

    it('should pass replaceAll operations', async () => {
        // replaceAll은 현재 [type, cid] scope만 통째로 교체하고, 다른 scope 데이터는 유지해야 한다.
        const cid = nextCid('replace');
        const chatDB = createIndexedDBAdapter('chat', cid);
        const otherChatDB = createIndexedDBAdapter('chat', `${cid}-other`);
        const otherUserDB = createIndexedDBAdapter('user', cid);

        await chatDB.saveAll([chat('R00001', { text: 'old-1' }), chat('R00002', { text: 'old-2' })] as any);
        await otherChatDB.save('KEEP-CID', chat('KEEP-CID', { text: 'keep-other-cid' }) as any);
        await otherUserDB.save('KEEP-TYPE', user('KEEP-TYPE', { name: 'keep-other-type' }) as any);

        const replaced = [chat('R00003', { text: 'new-3' }), chat('R00004', { text: 'new-4' })];
        expect(await chatDB.replaceAll(replaced as any)).toEqual(replaced);

        expect(sortById(await chatDB.loadAll())).toEqual(sortById(replaced));
        expect(await otherChatDB.loadAll()).toEqual([chat('KEEP-CID', { text: 'keep-other-cid' })]);
        expect(await otherUserDB.loadAll()).toEqual([user('KEEP-TYPE', { name: 'keep-other-type' })]);

        // 빈 배열로 교체하면 scope를 비워야 한다.
        expect(await chatDB.replaceAll([])).toEqual([]);
        expect(await chatDB.loadAll()).toEqual([]);
    });

    it('should pass delete operations', async () => {
        // delete/deleteAll은 스토리지에서 해당 키를 제거하고, 없는 id는 조용히 무시해야 한다.
        const cid = nextCid('delete');
        const chatDB = createIndexedDBAdapter('chat', cid);

        await expect(chatDB.delete('missing')).resolves.toBeUndefined();
        await expect(chatDB.deleteAll([])).resolves.toBeUndefined();

        const single = chat('D00001', { text: 'delete-one' });
        await chatDB.save(single.id, single as any);
        await chatDB.delete(single.id);
        expect(await chatDB.load(single.id)).toBeNull();

        await chatDB.saveAll([
            chat('D00002', { text: 'delete-2' }),
            chat('D00003', { text: 'delete-3' }),
            chat('D00004', { text: 'delete-4' }),
        ] as any);

        await chatDB.deleteAll(['D00003', 'missing', 'D00004']);
        expect(await chatDB.loadAll()).toEqual([chat('D00002', { text: 'delete-2' })]);
    });

    it('should isolate stored items from caller references', async () => {
        // 저장 후 원본 객체를 바꿔도 캐시에 저장된 값이 오염되지 않아야 한다.
        const cid = nextCid('clone');
        const chatDB = createIndexedDBAdapter('chat', cid);

        const single = chat('I00001', { text: 'original-save' });
        await chatDB.save(single.id, single as any);
        single.text = 'mutated-save';

        const batch = [chat('I00002', { text: 'original-batch-2' }), chat('I00003', { text: 'original-batch-3' })];
        await chatDB.saveAll(batch as any);
        batch[0].text = 'mutated-batch-2';
        batch[1].text = 'mutated-batch-3';

        expect(sortById(await chatDB.loadAll())).toEqual(
            sortById([
                chat('I00001', { text: 'original-save' }),
                chat('I00002', { text: 'original-batch-2' }),
                chat('I00003', { text: 'original-batch-3' }),
            ])
        );
    });

    it('should share persisted data across adapter instances', async () => {
        // 새 adapter 인스턴스를 만들어도 같은 IndexedDB cache를 계속 읽을 수 있어야 한다.
        // 이 케이스가 실제 웹 캐싱 유지 여부를 가장 직접적으로 보여준다.
        const cid = nextCid('persist');
        const writer = createIndexedDBAdapter('chat', cid);
        const reader = createIndexedDBAdapter('chat', cid);

        await writer.save('P00001', chat('P00001') as any);
        await writer.saveAll([chat('P00002', { text: 'persist-2' }), chat('P00003', { text: 'persist-3' })] as any);

        expect(sortById(await reader.loadAll())).toEqual(
            sortById([chat('P00001'), chat('P00002', { text: 'persist-2' }), chat('P00003', { text: 'persist-3' })])
        );
    });

    describe('general parameter validation', () => {
        it('should save with empty string id on the single-save path', async () => {
            // 단건 save는 id 가드 없음(indexedDBAdapter.ts:75) — 빈 문자열 id도 저장된다.
            const cid = nextCid('gpv-a1');
            const db = createIndexedDBAdapter('chat', cid);

            const item = chat('', { text: 'empty-id-save' });
            await db.save('', item as any);

            expect(await db.load('')).toEqual(item);
            expect(await db.loadAll()).toHaveLength(1);
        });

        it('should silently skip empty-string id in saveAll batch path', async () => {
            // 배치 경로의 `if (!itemId) return`(indexedDBAdapter.ts:90) 가 빈 문자열을 skip.
            // 단건 save(A1)와의 비대칭이 이 테스트의 핵심 신호.
            const cid = nextCid('gpv-a2');
            const db = createIndexedDBAdapter('chat', cid);

            await db.saveAll([chat('', { text: 'batch-empty' })] as any);

            expect(await db.loadAll()).toEqual([]);
        });

        it('should filter out empty-id and id-less items from a mixed saveAll', async () => {
            const cid = nextCid('gpv-a3');
            const db = createIndexedDBAdapter('chat', cid);

            const valid1 = chat('H1', { text: 'valid-1' });
            const valid2 = chat('H2', { text: 'valid-2' });
            await db.saveAll([chat('', { text: 'skip-empty' }), valid1, { no_id: true } as any, valid2] as any);

            expect(sortById(await db.loadAll())).toEqual(sortById([valid1, valid2]));
        });

        it('should silently skip empty-string id in replaceAll batch path', async () => {
            // replaceAll 도 동일한 id 가드(indexedDBAdapter.ts:112).
            const cid = nextCid('gpv-a4');
            const db = createIndexedDBAdapter('chat', cid);

            const valid = chat('R1', { text: 'valid-replace' });
            await db.replaceAll([chat('', { text: 'skip-empty' }), valid] as any);

            expect(await db.loadAll()).toEqual([valid]);
        });

        it('should store undefined as a real record detectable via loadAll', async () => {
            // load() 는 undefined 반환, loadAll() 에는 레코드가 잡힘.
            const cid = nextCid('gpv-a5');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('U1', undefined as any);

            expect(await db.loadAll()).toHaveLength(1);
            expect(await db.load('U1')).toBeUndefined();
        });

        it('should store null, exposing the ambiguity of load() between stored-null and missing', async () => {
            // "저장된 null" 과 "없음" 은 load() 반환(null)만으로 구분 불가(indexedDBAdapter.ts:126).
            // loadAll().length 로만 저장 사실을 확인할 수 있다는 계약을 고정한다.
            const cid = nextCid('gpv-a6');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('N1', null as any);

            expect(await db.loadAll()).toHaveLength(1);
            expect(await db.load('N1')).toBeNull();
            // 비교: 저장하지 않은 id 도 동일하게 null 을 반환 — 모호성의 직접 증거.
            expect(await db.load('N-missing')).toBeNull();
        });

        it('should return null without side effects for nonexistent and empty-string loads', async () => {
            const cid = nextCid('gpv-a7');
            const db = createIndexedDBAdapter('chat', cid);

            expect(await db.load('nonexistent')).toBeNull();
            expect(await db.load('')).toBeNull();
            expect(await db.load('nonexistent')).toBeNull();
            expect(await db.loadAll()).toEqual([]);
        });

        it('should resolve deleteAll([]) without error via short-circuit', async () => {
            // indexedDBAdapter.ts:157 짧은 circuit 경로.
            const cid = nextCid('gpv-a8');
            const db = createIndexedDBAdapter('chat', cid);

            await expect(db.deleteAll([])).resolves.toBeUndefined();
        });
    });

    describe('basic CRUD combinations', () => {
        it('should overwrite on double save with same id', async () => {
            const cid = nextCid('crud-b1');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('B1', chat('B1', { text: 'first' }) as any);
            await db.save('B1', chat('B1', { text: 'second' }) as any);

            expect(await db.load('B1')).toEqual(chat('B1', { text: 'second' }));
        });

        it('should overwrite a prior single save with saveAll containing the same id', async () => {
            const cid = nextCid('crud-b2');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('B2', chat('B2', { text: 'from-save' }) as any);
            await db.saveAll([chat('B2', { text: 'from-saveall' }), chat('B2x', { text: 'other' })] as any);

            expect(await db.load('B2')).toEqual(chat('B2', { text: 'from-saveall' }));
            expect(await db.load('B2x')).toEqual(chat('B2x', { text: 'other' }));
        });

        it('should apply last-write-wins for duplicate ids within a single saveAll batch', async () => {
            const cid = nextCid('crud-b3');
            const db = createIndexedDBAdapter('chat', cid);

            await db.saveAll([chat('X', { text: 'v1' }), chat('X', { text: 'v2' })] as any);

            expect(await db.load('X')).toEqual(chat('X', { text: 'v2' }));
            expect(await db.loadAll()).toHaveLength(1);
        });

        it('should support save → delete → load(null) → save-again cycle', async () => {
            const cid = nextCid('crud-b4');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('C4', chat('C4', { text: 'first' }) as any);
            await db.delete('C4');
            expect(await db.load('C4')).toBeNull();

            await db.save('C4', chat('C4', { text: 'reinserted' }) as any);
            expect(await db.load('C4')).toEqual(chat('C4', { text: 'reinserted' }));
        });

        it('should ignore missing ids and remove only existing ones in deleteAll mixed batch', async () => {
            const cid = nextCid('crud-b5');
            const db = createIndexedDBAdapter('chat', cid);

            const a = chat('B5A', { text: 'a' });
            const b = chat('B5B', { text: 'b' });
            const c = chat('B5C', { text: 'c' });
            await db.saveAll([a, b, c] as any);

            await db.deleteAll(['B5A', 'missing', 'B5C']);

            expect(await db.loadAll()).toEqual([b]);
        });
    });

    describe('edge cases', () => {
        it('should round-trip a 100KB string field', async () => {
            const cid = nextCid('edge-c1');
            const db = createIndexedDBAdapter('chat', cid);
            const big = 'x'.repeat(100 * 1024);
            const item = chat('C1', { text: big });

            await db.save('C1', item as any);

            expect(await db.load('C1')).toEqual(item);
        });

        it('should round-trip a 200-item batch via saveAll/loadAll', async () => {
            const cid = nextCid('edge-c2');
            const db = createIndexedDBAdapter('chat', cid);
            const items = Array.from({ length: 200 }, (_, i) =>
                chat(`C2-${String(i).padStart(3, '0')}`, { text: `item-${i}` })
            );

            await db.saveAll(items as any);

            const loaded = sortById(await db.loadAll());
            expect(loaded).toHaveLength(200);
            expect(loaded).toEqual(sortById(items));
        });

        it('should round-trip unicode and special-character ids', async () => {
            const cid = nextCid('edge-c3');
            const db = createIndexedDBAdapter('chat', cid);
            const unicodeId = '한글-😀-id';
            const spacedId = 'has spaces and :colons';

            await db.save(unicodeId, chat(unicodeId, { text: 'unicode' }) as any);
            await db.save(spacedId, chat(spacedId, { text: 'spaced' }) as any);

            expect(await db.load(unicodeId)).toEqual(chat(unicodeId, { text: 'unicode' }));
            expect(await db.load(spacedId)).toEqual(chat(spacedId, { text: 'spaced' }));
        });

        it('should round-trip a 512-character id', async () => {
            const cid = nextCid('edge-c4');
            const db = createIndexedDBAdapter('chat', cid);
            const longId = 'a'.repeat(512);

            await db.save(longId, chat(longId, { text: 'long' }) as any);

            expect(await db.load(longId)).toEqual(chat(longId, { text: 'long' }));
        });

        it('should return a fresh snapshot on each load, isolating from caller mutations', async () => {
            // 기존 save-측 격리(line 135)와 대칭. load 결과 mutation 이 다음 load 에 새지 않아야 한다.
            const cid = nextCid('edge-c5');
            const db = createIndexedDBAdapter('chat', cid);

            await db.save('C5', chat('C5', { text: 'original' }) as any);

            const first = (await db.load('C5')) as any;
            first.text = 'mutated-after-load';

            expect(await db.load('C5')).toEqual(chat('C5', { text: 'original' }));
        });

        it('should isolate scopes across a (type × cid) 2×2 matrix for the same id', async () => {
            const cidA = nextCid('edge-c6-A');
            const cidB = nextCid('edge-c6-B');
            const chatA = createIndexedDBAdapter('chat', cidA);
            const chatB = createIndexedDBAdapter('chat', cidB);
            const userA = createIndexedDBAdapter('user', cidA);
            const userB = createIndexedDBAdapter('user', cidB);

            await chatA.save('X', chat('X', { text: 'chat-A' }) as any);
            await chatB.save('X', chat('X', { text: 'chat-B' }) as any);
            await userA.save('X', user('X', { name: 'user-A' }) as any);
            await userB.save('X', user('X', { name: 'user-B' }) as any);

            expect(await chatA.load('X')).toEqual(chat('X', { text: 'chat-A' }));
            expect(await chatB.load('X')).toEqual(chat('X', { text: 'chat-B' }));
            expect(await userA.load('X')).toEqual(user('X', { name: 'user-A' }));
            expect(await userB.load('X')).toEqual(user('X', { name: 'user-B' }));
        });

        it('should preserve nested objects, arrays, and primitive types exactly', async () => {
            const cid = nextCid('edge-c7');
            const db = createIndexedDBAdapter('chat', cid);
            const item = chat('C7', {
                meta: { count: 1, tags: ['a', 'b'], flag: true, note: null },
            });

            await db.save('C7', item as any);

            expect(await db.load('C7')).toEqual(item);
        });
    });

    describe('error cases', () => {
        // (제외) Function 필드 저장 시 DataCloneError 를 기대하는 케이스는 런타임 의존성이 크다.
        // jsdom + fake-indexeddb 는 값을 조용히 통과시키고, 네이티브 브라우저는 DataCloneError 로 거부한다.
        // 이 경계는 Playwright 등 실제 브라우저 통합 테스트에서 고정하는 것이 맞다.

        it('should reject save when indexedDB.open fails', async () => {
            const cid = nextCid('err-d2');
            const db = createIndexedDBAdapter('chat', cid);
            const openError = new Error('open-failed');

            // 핸들러 속성 할당을 받을 수 있는 가짜 request 객체. onupgradeneeded 는 openDB 가 먼저 할당하고,
            // onsuccess/onerror 는 promisifyRequest 가 할당한다(indexedDBAdapter.ts:35-48, 13-18).
            const fake: {
                onsuccess: ((ev: unknown) => void) | null;
                onerror: ((ev: unknown) => void) | null;
                onupgradeneeded: ((ev: unknown) => void) | null;
                error: Error;
                result: unknown;
            } = { onsuccess: null, onerror: null, onupgradeneeded: null, error: openError, result: undefined };

            const spy = jest.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
                queueMicrotask(() => fake.onerror?.({ target: fake }));
                return fake as unknown as IDBOpenDBRequest;
            });

            await expect(db.save('D2', chat('D2') as any)).rejects.toBe(openError);

            spy.mockRestore();
        });

        it('should preserve every item when three saves run in parallel', async () => {
            const cid = nextCid('err-d3');
            const db = createIndexedDBAdapter('chat', cid);
            const items = [chat('P1'), chat('P2'), chat('P3')];

            await Promise.all(items.map(item => db.save(item.id, item as any)));

            expect(sortById(await db.loadAll())).toEqual(sortById(items));
        });
    });
});
