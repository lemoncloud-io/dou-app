import { MemoryStore } from '@chatic/storage';
import type { NativeReadResult } from '@chatic/storage';

import { HOME_SEARCH_KEY } from './auth';
import {
    NativeRuntimeNoSessionError,
    loadNativeSession,
    missingNativeRuntimeEnv,
    NATIVE_RUNTIME_ENV_KEYS,
} from './boot';
import { nativeSecretStore } from './storage';

jest.mock('react-native', () => ({ AppState: {}, Platform: { OS: 'ios' } }));

const SECRET_LOGOUT_PENDING_KEY = 'chatic-secret-logout-pending';

const FULL_ENV: Record<string, string> = Object.fromEntries(
    NATIVE_RUNTIME_ENV_KEYS.map(name => [name, name === 'VITE_ENV' ? 'dev' : `value-of-${name}`])
);

const fakeVault = (values: Record<string, string> = {}) => {
    let stored = { ...values };
    const vault = {
        get: jest.fn(async (): Promise<NativeReadResult> => ({ status: 'available', values: { ...stored } })),
        save: jest.fn(async (set: Record<string, string>, remove: readonly string[]) => {
            stored = { ...stored, ...set };
            remove.forEach(key => delete stored[key]);
            return true;
        }),
        clear: jest.fn(async () => {
            stored = {};
            return true;
        }),
    };
    return vault;
};

const setup = (vaultValues?: Record<string, string>) => {
    const vault = fakeVault(vaultValues);
    const plain = new MemoryStore();
    const storage = { secret: nativeSecretStore(vault), plain, device: new MemoryStore(), tab: new MemoryStore() };
    return { vault, plain, storage, load: () => loadNativeSession(storage, vault) };
};

describe('missingNativeRuntimeEnv', () => {
    it('names every required value the build lacks, and nothing when it has them all', () => {
        expect(missingNativeRuntimeEnv(name => FULL_ENV[name])).toEqual([]);
        expect(missingNativeRuntimeEnv(name => (name === 'VITE_HOST' ? ' ' : FULL_ENV[name]))).toEqual(['VITE_HOST']);
    });
});

describe('loadNativeSession', () => {
    it('loads the vault into the secret store and reports how it was found', async () => {
        const { storage, load } = setup({ 'chatic-relay-token': 't' });

        const loaded = await load();

        expect(loaded.secretStorage).toBe('vault');
        expect(loaded.vault.status).toBe('available');
        expect(storage.secret.get('chatic-relay-token')).toBe('t');
    });

    it('keeps a session signed in after the last logout, however long ago the logout was', async () => {
        const { storage, plain, vault, load } = setup({ 'chatic-relay-token': 'guest-after-logout' });
        plain.set(HOME_SEARCH_KEY, 'logout=1');

        const loaded = await load();

        expect(loaded.secretStorage).toBe('vault');
        expect(vault.clear).not.toHaveBeenCalled();
        expect(storage.secret.get('chatic-relay-token')).toBe('guest-after-logout');
    });

    it('finishes a logout whose clear was never confirmed, then leaves the emptied vault to the page', async () => {
        const { plain, vault, load } = setup({ 'chatic-relay-token': 'old' });
        plain.set(SECRET_LOGOUT_PENDING_KEY, '1');

        await expect(load()).rejects.toEqual(new NativeRuntimeNoSessionError('logout-finished'));
        expect(vault.clear).toHaveBeenCalled();
        expect(plain.get(SECRET_LOGOUT_PENDING_KEY)).toBeNull();
    });

    it('refuses a vault with no session, so the page can move one it still holds', async () => {
        const { vault, load } = setup();

        const loading = load();

        await expect(loading).rejects.toBeInstanceOf(NativeRuntimeNoSessionError);
        await expect(loading).rejects.toMatchObject({ code: 'NATIVE_RUNTIME_NO_SESSION', secretStorage: 'empty' });
        expect(vault.save).not.toHaveBeenCalled();
    });

    it('drops the address a session end saved, which only the runtime it no longer creates would read', async () => {
        const { plain, load } = setup();
        plain.set(HOME_SEARCH_KEY, 'logout=1');

        await expect(load()).rejects.toBeInstanceOf(NativeRuntimeNoSessionError);
        expect(plain.get(HOME_SEARCH_KEY)).toBeNull();
    });

    it('still loads on a vault it could not read, rather than guess it holds no session', async () => {
        const { vault, load } = setup();
        vault.get.mockResolvedValue({ status: 'unavailable', reason: 'error', values: {} });

        const loaded = await load();

        expect(loaded.secretStorage).toBe('unavailable');
    });

    it('does not count a vault holding only the device guest id as a session', async () => {
        const { load } = setup({ 'chatic-delegator-id': 'guest-1' });

        await expect(load()).rejects.toMatchObject({ secretStorage: 'empty' });
    });
});
