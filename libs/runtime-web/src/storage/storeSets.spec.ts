import { MemoryStore, NativeSecureStore, TolerantStore } from '@chatic/storage';

import {
    createShellVault,
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
} from './storeSets';

import type { IWebBridgeClient } from '@chatic/bridges';

const areas = () => ({ webLocal: new MemoryStore(), webSession: new MemoryStore() });
const fakeVault = { name: 'vault' } as unknown as NativeSecureStore;

describe('store sets', () => {
    it('tabStorageStores keeps the whole session in the tab store', () => {
        const given = areas();
        const stores = tabStorageStores(given);

        expect(stores.secret).toBe(given.webSession);
        expect(stores.plain).toBe(given.webSession);
        expect(stores.vault).toBeNull();
    });

    it('localStorageStores keeps the whole session in the local store', () => {
        const given = areas();
        const stores = localStorageStores(given);

        expect(stores.secret).toBe(given.webLocal);
        expect(stores.plain).toBe(given.webLocal);
        expect(stores.vault).toBeNull();
    });

    it('vaultStorageStores puts the secrets in the vault and the plain state in the local store', () => {
        const given = areas();
        const stores = vaultStorageStores({ ...given, vault: fakeVault });

        expect(stores.secret).toBe(fakeVault);
        expect(stores.vault).toBe(fakeVault);
        expect(stores.plain).toBe(given.webLocal);
    });

    it('vaultStorageStores takes the plain store the caller names', () => {
        const given = areas();
        const stores = vaultStorageStores({ ...given, vault: fakeVault, plain: given.webSession });

        expect(stores.plain).toBe(given.webSession);
        expect(stores.secret).toBe(fakeVault);
    });

    it('every set wraps the local store as device and the tab store as tab, tolerantly, over the areas it was handed', () => {
        for (const build of [
            tabStorageStores,
            localStorageStores,
            (given: ReturnType<typeof areas>) => vaultStorageStores({ ...given, vault: fakeVault }),
        ]) {
            const given = areas();
            const stores = build(given);

            expect(stores.webLocal).toBe(given.webLocal);
            expect(stores.webSession).toBe(given.webSession);
            expect(stores.device).toBeInstanceOf(TolerantStore);
            expect(stores.tab).toBeInstanceOf(TolerantStore);
            stores.device.set('d', '1');
            stores.tab.set('t', '1');
            expect(given.webLocal.get('d')).toBe('1');
            expect(given.webSession.get('t')).toBe('1');
        }
    });
});

describe('pageStorageAreas', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("is the page's localStorage and sessionStorage", () => {
        const { webLocal, webSession } = pageStorageAreas();
        webLocal.set('l', '1');
        webSession.set('s', '1');

        expect(localStorage.getItem('l')).toBe('1');
        expect(sessionStorage.getItem('s')).toBe('1');
    });
});

describe('createShellVault', () => {
    it('falls back to the store it is handed when the shell cannot keep the session', async () => {
        const request = jest.fn().mockRejectedValue(new Error('no vault'));
        const fallback = new MemoryStore();
        fallback.set('k', 'from-fallback');

        const vault = createShellVault({ client: { request } as unknown as IWebBridgeClient, fallback });

        expect(vault).toBeInstanceOf(NativeSecureStore);
        await vault.hydrate();
        expect(request).toHaveBeenCalled();
        expect(vault.status).toBe('unavailable');
        expect(vault.get('k')).toBe('from-fallback');
    });
});
