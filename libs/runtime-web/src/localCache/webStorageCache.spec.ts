import type { CacheModelOf } from '@chatic/bridge-messages';
import type { CacheStorage, DataContextProvider } from '@chatic/data';
import { MemoryStore } from '@chatic/storage';

import type { WebCacheStore } from './cacheStore';
import { INVITED_CLOUD_IMPORT_MARKER_KEY } from './invitedCloudImport';
import { webStorageCache } from './webStorageCache';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = CacheModelOf<'invitecloud'>;

const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
const nameOf = (value: unknown) => (value as object).constructor.name;
const row = (id: string, acceptedBy?: string[]): Row =>
    ({ id, cid: id, name: `cloud-${id}`, cloudType: 'invited', acceptedBy }) as Row;

const holding = (rows: Row[]) => {
    const loadAll = jest.fn().mockResolvedValue(rows);
    const storage = jest.fn(() => ({ loadAll }) as unknown as CacheStorage<'invitecloud'>);
    return { store: { storage } as unknown as WebCacheStore, storage, loadAll };
};

describe('webStorageCache', () => {
    it('keeps a domain in the tab store it is handed', async () => {
        const tab = new MemoryStore();
        const cache = webStorageCache({ tab, importFrom: holding([]).store });

        const storage = cache.storage('site', context);
        await storage.save('s1', { id: 's1' } as never);

        expect(nameOf(storage)).toBe('KeyValueTable');
        expect(tab.keys().length).toBeGreaterThan(0);
    });

    it('wraps invited clouds in the one-time import from the store it names, with the identity it is handed', async () => {
        const tab = new MemoryStore();
        const legacy = holding([row('mine', ['guest-1']), row('other', ['guest-2'])]);
        const cache = webStorageCache({
            tab,
            importFrom: legacy.store,
            getDelegatorId: () => 'guest-1',
            getRecordedCloudIds: () => [],
        });

        const storage = cache.storage('invitecloud', context);
        const rows = await storage.loadAll();

        expect(nameOf(storage)).toBe('InvitedCloudImportStorage');
        expect(legacy.storage).toHaveBeenCalledWith('invitecloud', context);
        expect(rows.map(item => item.id)).toEqual(['mine']);
        expect(tab.get(INVITED_CLOUD_IMPORT_MARKER_KEY)).not.toBeNull();
    });
});
