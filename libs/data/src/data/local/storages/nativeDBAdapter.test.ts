import { AppMessageTypes, useAppMessageStore } from '@chatic/app-messages';
import { createNativeDBAdapter } from './nativeDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const buildHandlers = () =>
    Object.values(AppMessageTypes).reduce(
        (handlers, type) => {
            handlers[type] = new Set();
            return handlers;
        },
        {} as Record<string, Set<unknown>>
    );

const resetAppMessageStore = () => {
    useAppMessageStore.setState({ handlers: buildHandlers() as never });
};

const createBridgeHarness = () => {
    // 앱 쪽 로컬 저장소를 단순 메모리 맵으로 흉내 낸다.
    // native adapter는 직접 DB를 만지는 게 아니라 bridge message 왕복이 핵심이므로,
    // 여기서는 "메시지 계약 + 저장 결과"만 검증한다.
    const records = new Map<string, any>();
    const messages: Array<{ type: string; nonce?: string; data: any }> = [];

    const key = (type: string, cid: string, id: string) => `${type}:${cid}:${id}`;
    const scopeKey = (type: string, cid: string) => `${type}:${cid}:`;
    const loadAll = (type: string, cid: string) =>
        Array.from(records.entries())
            .filter(([recordKey]) => recordKey.startsWith(scopeKey(type, cid)))
            .map(([, item]) => clone(item));

    resetAppMessageStore();

    window.ReactNativeWebView = {
        postMessage: (payload: string) => {
            const message = JSON.parse(payload) as { type: string; nonce?: string; data: any };
            messages.push(message);

            Promise.resolve().then(() => {
                const cid = message.data.cid ?? message.data.query?.cid ?? '';

                switch (message.type) {
                    case 'SaveCacheData': {
                        records.set(key(message.data.type, cid, message.data.id), clone(message.data.item));
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnSaveCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, id: message.data.id, cid },
                        } as any);
                        break;
                    }
                    case 'SaveAllCacheData': {
                        const items = message.data.items || [];
                        items.forEach((item: any) => {
                            if (!item?.id) return;
                            records.set(key(message.data.type, cid, item.id), clone(item));
                        });
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnSaveAllCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                ids: items.map((item: any) => item?.id).filter(Boolean),
                                cid,
                            },
                        } as any);
                        break;
                    }
                    case 'FetchCacheData': {
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnFetchCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                id: message.data.id,
                                item: clone(records.get(key(message.data.type, cid, message.data.id)) ?? null),
                                cid,
                            },
                        } as any);
                        break;
                    }
                    case 'FetchAllCacheData': {
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnFetchAllCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                items: loadAll(message.data.type, cid),
                            },
                        } as any);
                        break;
                    }
                    case 'DeleteCacheData': {
                        const recordKey = key(message.data.type, cid, message.data.id);
                        const existed = records.has(recordKey);
                        records.delete(recordKey);
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnDeleteCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                id: existed ? message.data.id : null,
                                cid,
                            },
                        } as any);
                        break;
                    }
                    case 'DeleteAllCacheData': {
                        const deletedIds = (message.data.ids || []).filter((id: string) => {
                            const recordKey = key(message.data.type, cid, id);
                            const existed = records.has(recordKey);
                            records.delete(recordKey);
                            return existed;
                        });
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnDeleteAllCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                ids: deletedIds,
                                cid,
                            },
                        } as any);
                        break;
                    }
                    default:
                        break;
                }
            });
        },
    };

    return {
        messages,
        cleanup: () => {
            delete window.ReactNativeWebView;
            resetAppMessageStore();
        },
    };
};

describe('createNativeDBAdapter', () => {
    afterEach(() => {
        delete window.ReactNativeWebView;
        resetAppMessageStore();
        jest.useRealTimers();
    });

    it('should pass load operations through bridge', async () => {
        // 앱 브릿지를 통해 읽은 결과도 type/cid scope가 분리되어야 한다.
        const cid = nextCid('load');
        const chatDB = createNativeDBAdapter('chat', cid);
        const otherChatDB = createNativeDBAdapter('chat', `${cid}-other`);
        const userDB = createNativeDBAdapter('user', cid);
        const harness = createBridgeHarness();

        try {
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
            expect(harness.messages.map(message => message.type)).toContain('FetchAllCacheData');
        } finally {
            harness.cleanup();
        }
    });

    it('should pass save and update operations through bridge', async () => {
        // save/saveAll은 현재 scope에만 반영되고, 다른 scope 데이터는 그대로 유지해야 한다.
        const cid = nextCid('save');
        const chatDB = createNativeDBAdapter('chat', cid);
        const otherChatDB = createNativeDBAdapter('chat', `${cid}-other`);
        const otherUserDB = createNativeDBAdapter('user', cid);
        const harness = createBridgeHarness();

        try {
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
            expect(harness.messages.map(message => message.type)).not.toContain('DeleteAllCacheData');
        } finally {
            harness.cleanup();
        }
    });

    it('should pass replaceAll operations through bridge', async () => {
        // native replaceAll은 FetchAll→DeleteAll→SaveAll 3단계로 현재 scope 전체를 교체해야 한다.
        const cid = nextCid('replace');
        const chatDB = createNativeDBAdapter('chat', cid);
        const otherChatDB = createNativeDBAdapter('chat', `${cid}-other`);
        const harness = createBridgeHarness();

        try {
            await chatDB.saveAll([chat('R00001', { text: 'old-1' }), chat('R00002', { text: 'old-2' })] as any);
            await otherChatDB.save('KEEP', chat('KEEP', { text: 'keep-other-cid' }) as any);

            const replaced = [chat('R00003', { text: 'new-3' }), chat('R00004', { text: 'new-4' })];
            expect(await chatDB.replaceAll(replaced as any)).toEqual(replaced);

            expect(sortById(await chatDB.loadAll())).toEqual(sortById(replaced));
            expect(await otherChatDB.loadAll()).toEqual([chat('KEEP', { text: 'keep-other-cid' })]);

            const types = harness.messages.map(m => m.type);
            expect(types).toContain('FetchAllCacheData');
            expect(types).toContain('DeleteAllCacheData');
            expect(types).toContain('SaveAllCacheData');
        } finally {
            harness.cleanup();
        }
    });

    it('should pass delete operations through bridge', async () => {
        // native bridge 삭제는 반환값 없이 응답만 확인하고 상태를 제거해야 한다.
        const cid = nextCid('delete');
        const chatDB = createNativeDBAdapter('chat', cid);
        const harness = createBridgeHarness();

        try {
            expect(await chatDB.delete('missing')).toBeUndefined();
            expect(await chatDB.deleteAll([])).toBeUndefined();

            const single = chat('D00001', { text: 'delete-one' });
            await chatDB.save(single.id, single as any);
            expect(await chatDB.delete(single.id)).toBeUndefined();
            expect(await chatDB.load(single.id)).toBeNull();

            await chatDB.saveAll([
                chat('D00002', { text: 'delete-2' }),
                chat('D00003', { text: 'delete-3' }),
                chat('D00004', { text: 'delete-4' }),
            ] as any);

            expect(await chatDB.deleteAll(['D00003', 'missing', 'D00004'])).toBeUndefined();
            expect(await chatDB.loadAll()).toEqual([chat('D00002', { text: 'delete-2' })]);
        } finally {
            harness.cleanup();
        }
    });

    it('should ignore messages with the wrong nonce', async () => {
        // 동시에 여러 요청이 있을 수 있으므로, 응답은 nonce로 정확히 매칭되어야 한다.
        const cid = nextCid('nonce');
        const sentMessages: Array<{ nonce?: string }> = [];

        resetAppMessageStore();
        window.ReactNativeWebView = {
            postMessage: payload => {
                sentMessages.push(JSON.parse(payload));
            },
        };

        const chatDB = createNativeDBAdapter('chat', cid);
        let resolved = false;
        const pending = chatDB.load('N00001').then(result => {
            resolved = true;
            return result;
        });

        const nonce = sentMessages[0]?.nonce;

        useAppMessageStore.getState().handleMessage({
            type: 'OnFetchCacheData',
            nonce: 'wrong-nonce',
            data: { type: 'chat', id: 'N00001', item: chat('N00001', { text: 'wrong' }), cid },
        } as any);

        await Promise.resolve();
        expect(resolved).toBe(false);

        useAppMessageStore.getState().handleMessage({
            type: 'OnFetchCacheData',
            nonce,
            data: { type: 'chat', id: 'N00001', item: chat('N00001', { text: 'matched' }), cid },
        } as any);

        await expect(pending).resolves.toEqual(chat('N00001', { text: 'matched' }));
    });

    it('should timeout and cleanup handlers when app does not respond', async () => {
        // 브릿지 응답이 없을 때 핸들러가 남아 누수되지 않는지도 같이 본다.
        jest.useFakeTimers();
        resetAppMessageStore();

        window.ReactNativeWebView = {
            postMessage: () => undefined,
        };

        const chatDB = createNativeDBAdapter('chat', nextCid('timeout'));
        const pending = chatDB.load('T00001');

        expect(useAppMessageStore.getState().handlers.OnFetchCacheData.size).toBe(1);

        jest.advanceTimersByTime(5000);

        await expect(pending).rejects.toThrow('Timeout waiting for app message: OnFetchCacheData');
        expect(useAppMessageStore.getState().handlers.OnFetchCacheData.size).toBe(0);
    });

    it('should isolate stored items from caller references', async () => {
        // 앱 브릿지 경유 저장도 caller reference와 분리되어야 캐시 오염이 없다.
        const cid = nextCid('clone');
        const chatDB = createNativeDBAdapter('chat', cid);
        const harness = createBridgeHarness();

        try {
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
        } finally {
            harness.cleanup();
        }
    });
});
