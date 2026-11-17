import { config } from '@chatic/config';
import { MemoryStore } from '@chatic/storage';
import type { NativeReadResult } from '@chatic/storage';

import { HOME_SEARCH_KEY } from './auth';
import {
    NativeRuntimeEnvError,
    NativeRuntimeNoSessionError,
    bootNativeRuntime,
    missingNativeRuntimeEnv,
    NATIVE_RUNTIME_ENV_KEYS,
} from './boot';
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

    it('finishes a logout whose clear was never confirmed, then leaves the emptied vault to the page', async () => {
        const { options, plain, vault } = setup({ 'chatic-relay-token': 'old' });
        plain.set(SECRET_LOGOUT_PENDING_KEY, '1');

        await expect(bootNativeRuntime({ ...options, env: name => FULL_ENV[name] })).rejects.toEqual(
            new NativeRuntimeNoSessionError('logout-finished')
        );
        expect(vault.clear).toHaveBeenCalled();
        expect(plain.get(SECRET_LOGOUT_PENDING_KEY)).toBeNull();
        expect(createNativeRuntime).not.toHaveBeenCalled();
    });

    it('creates nothing on a vault with no session, so the page can move one it still holds', async () => {
        // An install updating from an app without a vault: its session is in the page's localStorage.
        const { options, vault } = setup();

        const booting = bootNativeRuntime({ ...options, env: name => FULL_ENV[name] });

        await expect(booting).rejects.toBeInstanceOf(NativeRuntimeNoSessionError);
        await expect(booting).rejects.toMatchObject({ code: 'NATIVE_RUNTIME_NO_SESSION', secretStorage: 'empty' });
        expect(createNativeRuntime).not.toHaveBeenCalled();
        expect(vault.save).not.toHaveBeenCalled();
    });

    it('drops the address a session end saved, which only the runtime it no longer creates would read', async () => {
        const { options, plain } = setup();
        plain.set(HOME_SEARCH_KEY, 'logout=1');

        await expect(bootNativeRuntime({ ...options, env: name => FULL_ENV[name] })).rejects.toBeInstanceOf(
            NativeRuntimeNoSessionError
        );
        expect(plain.get(HOME_SEARCH_KEY)).toBeNull();
    });

    it('still creates the runtime on a vault it could not read, rather than guess it holds no session', async () => {
        const { options, vault } = setup();
        vault.get.mockResolvedValue({ status: 'unavailable', reason: 'error', values: {} });

        const boot = await bootNativeRuntime({ ...options, env: name => FULL_ENV[name] });

        expect(boot.secretStorage).toBe('unavailable');
        expect(createNativeRuntime).toHaveBeenCalled();
    });

    it('does not count a vault holding only the device guest id as a session', async () => {
        const { options } = setup({ 'chatic-delegator-id': 'guest-1' });

        await expect(bootNativeRuntime({ ...options, env: name => FULL_ENV[name] })).rejects.toMatchObject({
            secretStorage: 'empty',
        });
        expect(createNativeRuntime).not.toHaveBeenCalled();
    });
});
