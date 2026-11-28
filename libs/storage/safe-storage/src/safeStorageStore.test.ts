import { safeStorageStore } from './safeStorageStore';
import type { ISecureStorage, SecureStorageSnapshot } from './types';

const vaultWith = (snapshot: SecureStorageSnapshot) => {
    const vault = {
        get: jest.fn(async () => snapshot),
        save: jest.fn(async () => true),
        clear: jest.fn(async () => true),
    } satisfies Pick<ISecureStorage, 'get' | 'save' | 'clear'>;
    return vault;
};

describe('safeStorageStore', () => {
    it('reads the values the vault held at open', async () => {
        const store = await safeStorageStore(vaultWith({ status: 'available', values: { token: 'a', user: 'b' } }));

        expect(store.get('token')).toBe('a');
        expect(store.get('missing')).toBeNull();
        expect(store.keys()).toEqual(['token', 'user']);
    });

    it('writes each change through to the vault and reads it back at once', async () => {
        const vault = vaultWith({ status: 'available', values: { token: 'a' } });
        const store = await safeStorageStore(vault);

        store.set('token', 'b');
        store.remove('token');
        store.remove('token');
        store.set('user', 'c');
        store.clear();

        expect(vault.save.mock.calls).toEqual([
            [{ token: 'b' }, []],
            [{}, ['token']],
            [{ user: 'c' }, []],
        ]);
        expect(vault.clear).toHaveBeenCalledTimes(1);
        expect(store.keys()).toEqual([]);
    });

    it('opens empty on an unavailable vault', async () => {
        const store = await safeStorageStore(vaultWith({ status: 'unavailable', reason: 'error', values: {} }));

        expect(store.keys()).toEqual([]);
    });
});
