import type { KeyValueStore } from '@chatic/storage';

import {
    describeStoreRoles,
    mediumOf,
    readActiveStores,
    readCacheRoutes,
    readPortChoices,
    recordActiveStores,
    recordCacheRoutes,
    recordPortChoices,
    resetActiveStorageForTests,
    type ActiveStores,
    type ActiveVault,
} from './activeStorage';

const store = (): KeyValueStore => ({
    get: () => null,
    set: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
    keys: () => [],
});

const vault = (): ActiveVault => ({ ...store(), status: 'available' });

describe('activeStorage', () => {
    afterEach(() => resetActiveStorageForTests());

    it('reads back nothing until the entry point records', () => {
        expect(readActiveStores()).toBeNull();
        expect(readPortChoices()).toEqual({});
        expect(readCacheRoutes()).toBeNull();
    });

    it('keeps the very store objects it was handed', () => {
        const webLocal = store();
        const stores: ActiveStores = { secret: webLocal, plain: webLocal, vault: null, webLocal, webSession: store() };

        recordActiveStores(stores);
        recordPortChoices({ storage: 'storage.resolved', cache: 'cache.web-local', engine: 'engine.page' });
        recordCacheRoutes([{ type: 'chat', route: 'native' }]);

        expect(readActiveStores()?.webLocal).toBe(webLocal);
        expect(readPortChoices()).toEqual({ storage: 'storage.resolved', cache: 'cache.web-local', engine: 'engine.page' });
        expect(readCacheRoutes()).toEqual([{ type: 'chat', route: 'native' }]);
    });

    describe('describeStoreRoles', () => {
        it('puts the secrets in the vault and the plain state in localStorage for a shell with a vault', () => {
            const webLocal = store();
            const v = vault();
            const stores: ActiveStores = { secret: v, plain: webLocal, vault: v, webLocal, webSession: store() };

            expect(describeStoreRoles(stores)).toEqual({
                secret: 'vault',
                plain: 'localStorage',
                device: 'localStorage',
                tab: 'sessionStorage',
            });
        });

        it('puts the whole session in sessionStorage for a plain tab', () => {
            const webSession = store();
            const stores: ActiveStores = { secret: webSession, plain: webSession, vault: null, webLocal: store(), webSession };

            expect(describeStoreRoles(stores)).toMatchObject({ secret: 'sessionStorage', plain: 'sessionStorage' });
        });
    });

    it('answers null for a store that is none of the set', () => {
        const stores: ActiveStores = { secret: store(), plain: store(), vault: null, webLocal: store(), webSession: store() };

        expect(mediumOf(stores.secret, stores)).toBeNull();
    });
});
