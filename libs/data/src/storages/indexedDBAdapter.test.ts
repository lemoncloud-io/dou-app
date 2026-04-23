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
});
