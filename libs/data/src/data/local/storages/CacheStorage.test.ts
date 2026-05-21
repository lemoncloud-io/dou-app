import type { CacheStorage } from './index';
import { type CacheStorageFactory, createCacheStorages } from './index';

describe('createCacheStorages', () => {
    it('creates storage instances for all cache types with the same context provider', () => {
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a' }),
            setContext: () => undefined,
        };

        const storage = { kind: 'mock-storage' } as unknown as CacheStorage<any>;
        const storageFactory: CacheStorageFactory = jest.fn(() => storage);

        const storages = createCacheStorages(contextProvider, storageFactory);

        expect(storageFactory).toHaveBeenCalledTimes(6);
        expect(storageFactory).toHaveBeenNthCalledWith(1, 'channel', contextProvider);
        expect(storageFactory).toHaveBeenNthCalledWith(2, 'chat', contextProvider);
        expect(storageFactory).toHaveBeenNthCalledWith(3, 'invitecloud', contextProvider);
        expect(storageFactory).toHaveBeenNthCalledWith(4, 'join', contextProvider);
        expect(storageFactory).toHaveBeenNthCalledWith(5, 'site', contextProvider);
        expect(storageFactory).toHaveBeenNthCalledWith(6, 'user', contextProvider);

        expect(storages).toEqual({
            channel: storage,
            chat: storage,
            inviteCloud: storage,
            join: storage,
            site: storage,
            user: storage,
        });
    });
});
