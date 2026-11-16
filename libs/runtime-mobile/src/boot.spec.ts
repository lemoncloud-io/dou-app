import { config } from '@chatic/config';
import { MemoryStore } from '@chatic/storage';
import type { NativeReadResult } from '@chatic/storage';

import { HOME_SEARCH_KEY } from './auth';
import { NativeRuntimeEnvError, bootNativeRuntime, missingNativeRuntimeEnv, NATIVE_RUNTIME_ENV_KEYS } from './boot';
import { createNativeRuntime } from './createNativeRuntime';
import { nativeSecretStore } from './storage';

jest.mock('react-native', () => ({ AppState: {}, Platform: { OS: 'ios' } }));
// The runtime's assembly is runtime-core's and tested there; here only what reaches it.
jest.mock('./createNativeRuntime', () => ({ createNativeRuntime: jest.fn(() => ({ engine: true })) }));

/** The plain-store key a logout whose vault clear was not confirmed leaves (`@chatic/session`). */
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
    const options = {
        storage: { secret: nativeSecretStore(vault), plain, device: new MemoryStore() },
        vault,
        cache: {} as never,
        userAgent: 'ua',
        leaveToHome: jest.fn(),
    };
    return { vault, plain, options };
};

describe('missingNativeRuntimeEnv', () => {
    it('names every required value the build lacks, and nothing when it has them all', () => {
        expect(missingNativeRuntimeEnv(name => FULL_ENV[name])).toEqual([]);
        expect(missingNativeRuntimeEnv(name => (name === 'VITE_HOST' ? ' ' : FULL_ENV[name]))).toEqual(['VITE_HOST']);
    });
});

describe('bootNativeRuntime', () => {
    const mockInit = jest.spyOn(config, 'init');

    beforeEach(() => {
        mockInit.mockClear();
        (createNativeRuntime as jest.Mock).mockClear();
    });

    it('starts nothing when the build lacks a value the runtime needs', async () => {
        const { options, vault } = setup();
        const env = (name: string) => (name === 'VITE_BACKEND_ENDPOINT' ? undefined : FULL_ENV[name]);

        await expect(bootNativeRuntime({ ...options, env })).rejects.toEqual(
            new NativeRuntimeEnvError(['VITE_BACKEND_ENDPOINT'])
        );
        expect(mockInit).not.toHaveBeenCalled();
        expect(vault.get).not.toHaveBeenCalled();
        expect(createNativeRuntime).not.toHaveBeenCalled();
    });

    it('configures from the build, loads the vault, then creates the runtime with the loaded stores', async () => {
        const { options } = setup({ 'chatic-relay-token': 't' });

        const boot = await bootNativeRuntime({ ...options, env: name => FULL_ENV[name] });

        const env = mockInit.mock.calls[0][0].env;
        expect(config.get('env.stage')).toBe('DEV');
        expect(env.stage()).toBe('DEV');
        expect(env.platform()).toBe('ios');
        expect(env.raw('VITE_HOST')).toBe('value-of-vite_host');
        expect(boot.secretStorage).toBe('vault');
        expect(boot.vault.status).toBe('available');
        expect(options.storage.secret.get('chatic-relay-token')).toBe('t');
        const created = (createNativeRuntime as jest.Mock).mock.calls[0][0];
        expect(created.storage.secret).toBe(options.storage.secret);
        expect(created).not.toHaveProperty('vault');
        expect(created).not.toHaveProperty('env');
    });

    it('keeps a session signed in after the last logout, however long ago the logout was', async () => {
        const { options, plain, vault } = setup({ 'chatic-relay-token': 'guest-after-logout' });
        // The address the logout saved; the process ran on and a guest signed in after it.
        plain.set(HOME_SEARCH_KEY, 'logout=1');

        const boot = await bootNativeRuntime({ ...options, env: name => FULL_ENV[name] });

        expect(boot.secretStorage).toBe('vault');
        expect(vault.clear).not.toHaveBeenCalled();
        expect(options.storage.secret.get('chatic-relay-token')).toBe('guest-after-logout');
    });

    it('finishes a logout whose clear was never confirmed', async () => {
        const { options, plain } = setup({ 'chatic-relay-token': 'old' });
        plain.set(SECRET_LOGOUT_PENDING_KEY, '1');

        const boot = await bootNativeRuntime({ ...options, env: name => FULL_ENV[name] });

        expect(boot.secretStorage).toBe('logout-finished');
        expect(plain.get(SECRET_LOGOUT_PENDING_KEY)).toBeNull();
    });
});
