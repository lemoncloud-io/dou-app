import { AppMessageTypes, useAppMessageStore } from '@chatic/app-messages';
import { createNativeDBAdapter } from './nativeDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const chat = (id: string, overrides: Record<string, unknown> = {}) =>
    ({
        id,
        cid: 'model-cid',
        channelId: 'channel-main',
        text: `chat-${id}`,
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    }) as any;

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
    const records = new Map<string, any>();
    const messages: Array<{ type: string; nonce?: string; data: any }> = [];

    const key = (type: string, cid: string, uid: string, id: string) => `${type}:${cid}:${uid}:${id}`;
    const loadAll = (type: string, cid: string, uid: string) =>
        Array.from(records.entries())
            .filter(([recordKey]) => recordKey.startsWith(`${type}:${cid}:${uid}:`))
            .map(([, item]) => clone(item));

    resetAppMessageStore();
    window.ReactNativeWebView = {
        postMessage: payload => {
            const message = JSON.parse(payload) as { type: string; nonce?: string; data: any };
            messages.push(message);

            Promise.resolve().then(() => {
                const cid = message.data?.cid ?? message.data?.query?.cid ?? 'default';
                const uid = message.data?.uid ?? message.data?.query?.uid ?? 'default';

                switch (message.type) {
                    case 'SaveCacheData':
                        records.set(key(message.data.type, cid, uid, message.data.id), clone(message.data.item));
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnSaveCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, cid, id: message.data.id, success: true },
                        } as any);
                        break;
                    case 'SaveAllCacheData':
                        (message.data.items || []).forEach((item: any) => {
                            if (!item?.id) return;
                            records.set(key(message.data.type, cid, uid, item.id), clone(item));
                        });
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnSaveAllCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                cid,
                                ids: (message.data.items || []).map((i: any) => i?.id).filter(Boolean),
                                success: true,
                            },
                        } as any);
                        break;
                    case 'FetchCacheData':
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnFetchCacheData',
                            nonce: message.nonce,
                            data: {
                                type: message.data.type,
                                cid,
                                uid,
                                id: message.data.id,
                                item: clone(records.get(key(message.data.type, cid, uid, message.data.id)) ?? null),
                            },
                        } as any);
                        break;
                    case 'FetchAllCacheData':
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnFetchAllCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, cid, uid, items: loadAll(message.data.type, cid, uid) },
                        } as any);
                        break;
                    case 'DeleteCacheData':
                        records.delete(key(message.data.type, cid, uid, message.data.id));
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnDeleteCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, cid, id: message.data.id, success: true },
                        } as any);
                        break;
                    case 'DeleteAllCacheData':
                        (message.data.ids || []).forEach((id: string) =>
                            records.delete(key(message.data.type, cid, uid, id))
                        );
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnDeleteAllCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, cid, ids: message.data.ids || [], success: true },
                        } as any);
                        break;
                    case 'ClearCacheData':
                        Array.from(records.keys())
                            .filter(recordKey => recordKey.startsWith(`${message.data.type}:${cid}:${uid}:`))
                            .forEach(recordKey => records.delete(recordKey));
                        useAppMessageStore.getState().handleMessage({
                            type: 'OnClearCacheData',
                            nonce: message.nonce,
                            data: { type: message.data.type, success: true },
                        } as any);
                        break;
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

    it('reads/writes within cid+uid scope', async () => {
        const harness = createBridgeHarness();
        const contextA = { getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }), setContext: () => undefined };
        const contextB = { getContext: () => ({ cid: 'cloud-a', uid: 'user-b' }), setContext: () => undefined };
        const storageA = createNativeDBAdapter('chat', contextA);
        const storageB = createNativeDBAdapter('chat', contextB);

        try {
            await storageA.save('A1', chat('A1', { text: 'from-a' }));
            await storageB.save('B1', chat('B1', { text: 'from-b' }));

            expect(await storageA.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
            expect(await storageB.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);
            expect(harness.messages.map(message => message.type)).toContain('SaveCacheData');
        } finally {
            harness.cleanup();
        }
    });

    it('uses latest cid/uid from contextProvider at call-time', async () => {
        const harness = createBridgeHarness();
        const context = { cid: 'cloud-a', uid: 'user-a' };
        const contextProvider = {
            getContext: () => ({ cid: context.cid, uid: context.uid }),
            setContext: (next: { cid: string; uid: string }) => {
                context.cid = next.cid;
                context.uid = next.uid;
            },
        };
        const storage = createNativeDBAdapter('chat', contextProvider);

        try {
            await storage.save('A1', chat('A1', { text: 'from-a' }));
            contextProvider.setContext({ cid: 'cloud-b', uid: 'user-b' });
            await storage.save('B1', chat('B1', { text: 'from-b' }));

            expect(await storage.loadAll()).toEqual([chat('B1', { text: 'from-b' })]);
            contextProvider.setContext({ cid: 'cloud-a', uid: 'user-a' });
            expect(await storage.loadAll()).toEqual([chat('A1', { text: 'from-a' })]);
        } finally {
            harness.cleanup();
        }
    });

    it('replaceAll follows fetch-delete-save bridge flow', async () => {
        const harness = createBridgeHarness();
        const contextProvider = { getContext: () => ({ cid: 'cloud-r', uid: 'user-r' }), setContext: () => undefined };
        const storage = createNativeDBAdapter('chat', contextProvider);

        try {
            await storage.saveAll([chat('R1'), chat('R2')] as any);
            await storage.replaceAll([chat('R3')] as any);

            expect(await storage.loadAll()).toEqual([chat('R3')]);
            const types = harness.messages.map(message => message.type);
            expect(types).toContain('FetchAllCacheData');
            expect(types).toContain('DeleteAllCacheData');
            expect(types).toContain('SaveAllCacheData');
        } finally {
            harness.cleanup();
        }
    });

    it('times out when app bridge does not respond', async () => {
        jest.useFakeTimers();
        resetAppMessageStore();
        window.ReactNativeWebView = {
            postMessage: () => undefined,
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-timeout', uid: 'user-timeout' }),
            setContext: () => undefined,
        };
        const storage = createNativeDBAdapter('chat', contextProvider);
        const pending = storage.load('T1');

        jest.advanceTimersByTime(5000);
        await expect(pending).rejects.toThrow('Timeout waiting for app message: OnFetchCacheData');
    });

    it('filters expired records while loading', async () => {
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1000);
        const harness = createBridgeHarness();
        const contextProvider = { getContext: () => ({ cid: 'ttl', uid: 'user-ttl' }), setContext: () => undefined };
        const storage = createNativeDBAdapter('user', contextProvider);

        try {
            await storage.save('U1', { id: 'U1', cid: 'ttl', name: 'ttl-user' } as any);
            nowSpy.mockReturnValue(1000 + 6 * 60 * 1000);
            expect(await storage.loadAll()).toEqual([]);
        } finally {
            harness.cleanup();
            nowSpy.mockRestore();
        }
    });
});
