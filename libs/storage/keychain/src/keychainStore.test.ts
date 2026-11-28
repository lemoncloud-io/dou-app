import type { OnStorageGetPayload } from '@chatic/bridge-messages';

import { keychainStore } from './keychainStore';
import type { ISecureStorageService } from './types';

const vaultWith = (snapshot: OnStorageGetPayload) => {
    const vault = {
        get: jest.fn(async () => snapshot),
        save: jest.fn(async () => true),
        clear: jest.fn(async () => true),
    } satisfies Pick<ISecureStorageService, 'get' | 'save' | 'clear'>;
    return vault;
};

describe('keychainStore', () => {
    it('reads the values the vault held at open', async () => {
        const store = await keychainStore(vaultWith({ status: 'available', values: { token: 'a', user: 'b' } }));

        expect(store.get('token')).toBe('a');
        expect(store.get('missing')).toBeNull();
        expect(store.keys()).toEqual(['token', 'user']);
    });

    it('writes each change through to the vault and reads it back at once', async () => {
        const vault = vaultWith({ status: 'available', values: { token: 'a' } });
        const store = await keychainStore(vault);

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

    it('refuses to open an unavailable vault, so a locked vault is never taken for an empty one', async () => {
        const vault = vaultWith({ status: 'unavailable', reason: 'locked', values: {} });

        await expect(keychainStore(vault)).rejects.toThrow('keychain vault unavailable: locked');
        expect(vault.save).not.toHaveBeenCalled();
    });
});
