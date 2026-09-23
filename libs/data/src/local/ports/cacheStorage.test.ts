import type { CacheStorage } from './cacheStorage';
import { type CacheStorageFactory, createCacheStorages, createScopedCacheStorage } from './cacheStorage';

const SLOT_TYPES = ['channel', 'chat', 'invitecloud', 'join', 'profile', 'site', 'user', 'meta', 'invite'];

/** A factory that hands out a distinct, labelled storage per call and remembers what each was built for. */
const createRecordingFactory = () => {
    const built: Array<{ type: string; cid?: string; uid?: string; storage: CacheStorage<any> }> = [];
    const factory: CacheStorageFactory = jest.fn((type, provider) => {
        const { cid, uid } = provider.getContext();
        const storage = { label: `${type}:${cid}:${uid}` } as unknown as CacheStorage<any>;
        built.push({ type, cid, uid, storage });
        return storage;
    }) as unknown as CacheStorageFactory;
    return { factory, built };
};

describe('createCacheStorages', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'me', sid: 'site-1', socketCid: 'cloud-a' }),
        setContext: () => undefined,
    };

    it('builds one storage per slot during assembly, in slot order, for the scope current at assembly', () => {
        const { factory, built } = createRecordingFactory();

        createCacheStorages(contextProvider, factory);

        expect(built.map(entry => entry.type)).toEqual(SLOT_TYPES);
        for (const entry of built) {
            expect(entry).toMatchObject({ cid: 'cloud-a', uid: 'me' });
        }
    });

    it('hands every slot a snapshot of the scope, not the live provider', () => {
        let live = { cid: 'cloud-a', uid: 'me' };
        const mutableProvider = { getContext: () => live, setContext: () => undefined };
        const providers: Array<{ getContext(): unknown }> = [];
        const factory = jest.fn((_type, provider) => {
            providers.push(provider);
            return {} as CacheStorage<any>;
        }) as unknown as CacheStorageFactory;

        createCacheStorages(mutableProvider, factory);
        live = { cid: 'cloud-b', uid: 'other' };

        // The adapter reads its provider at call time; handed the live one, that read would follow
        // the session. Every provider it was given must keep answering with the assembly scope.
        expect(providers).toHaveLength(9);
        for (const provider of providers) {
            expect(provider.getContext()).toEqual({ cid: 'cloud-a', uid: 'me' });
        }
    });

    it('reuses the assembly-time storage for that scope instead of building it again', () => {
        const { factory, built } = createRecordingFactory();
        const storages = createCacheStorages(contextProvider, factory);

        const chat = storages.chat.forScope({ cid: 'cloud-a', uid: 'me' });

        expect(chat).toBe(built.find(entry => entry.type === 'chat')?.storage);
        expect(factory).toHaveBeenCalledTimes(9);
    });
});

describe('createScopedCacheStorage', () => {
    it('builds nothing until a scope is asked for when no initial context is given', () => {
        const { factory } = createRecordingFactory();

        createScopedCacheStorage('chat', factory);

        expect(factory).not.toHaveBeenCalled();
    });

    it('gives each (cid, uid) partition its own storage, built for exactly that scope', () => {
        const { factory, built } = createRecordingFactory();
        const slot = createScopedCacheStorage('chat', factory);

        const a = slot.forScope({ cid: 'cloud-a', uid: 'me' });
        const b = slot.forScope({ cid: 'cloud-b', uid: 'me' });
        const otherUser = slot.forScope({ cid: 'cloud-a', uid: 'other' });

        expect(new Set([a, b, otherUser]).size).toBe(3);
        expect(built.map(entry => `${entry.cid}/${entry.uid}`)).toEqual(['cloud-a/me', 'cloud-b/me', 'cloud-a/other']);
    });

    it('returns the same storage for the same partition, whatever else the context carries', () => {
        const { factory } = createRecordingFactory();
        const slot = createScopedCacheStorage('chat', factory);

        const first = slot.forScope({ cid: 'cloud-a', uid: 'me', sid: 'site-1', socketCid: 'cloud-a' });
        const second = slot.forScope({ cid: 'cloud-a', uid: 'me', sid: 'site-2' });

        expect(second).toBe(first);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('treats a missing cid as the relay partition, the same one an explicit "default" names', () => {
        const { factory } = createRecordingFactory();
        const slot = createScopedCacheStorage('chat', factory);

        expect(slot.forScope({ uid: 'me' })).toBe(slot.forScope({ cid: 'default', uid: 'me' }));
    });

    it('shares one storage across every uid-less scope — there is no partition to tell them apart', () => {
        const { factory, built } = createRecordingFactory();
        const slot = createScopedCacheStorage('chat', factory);

        const first = slot.forScope({ cid: 'cloud-a' });
        const second = slot.forScope({ cid: 'cloud-b' });

        expect(second).toBe(first);
        // The adapter still receives no uid, so it resolves no scope and skips every operation.
        expect(built).toHaveLength(1);
        expect(built[0].uid).toBeUndefined();
    });

    it('keeps one storage for a fixed-partition type no matter which scope asks', () => {
        const { factory } = createRecordingFactory();
        const slot = createScopedCacheStorage('invitecloud', factory);

        const first = slot.forScope({ cid: 'cloud-a', uid: 'me' });
        const second = slot.forScope({ cid: 'cloud-b', uid: 'other' });
        const sessionless = slot.forScope({});

        expect(second).toBe(first);
        expect(sessionless).toBe(first);
        expect(factory).toHaveBeenCalledTimes(1);
    });
});
