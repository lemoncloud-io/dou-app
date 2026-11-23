import type { RuntimePorts } from '@chatic/runtime-core';
import { MemoryStore } from '@chatic/storage';
import type { NativeReadResult } from '@chatic/storage';

import { HOME_SEARCH_KEY } from '../auth';
import { NativeRuntimeNoSessionError } from '../boot';
import type { KeyValueFile } from '../storage';
import {
    authMobile,
    cacheMobileSqlite,
    foregroundAppState,
    mobileHostFacts,
    storageMobileVault,
    transportMobile,
} from './index';

jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Platform: { OS: 'android' },
}));
jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn(() => () => undefined) },
}));

const facts = { platform: 'android', userAgent: 'chatic-ua' } as const;

const memoryFile = (): KeyValueFile => {
    const values = new Map<string, string>();
    return {
        getString: key => values.get(key),
        set: (key, value) => void values.set(key, value),
        remove: key => values.delete(key),
        clearAll: () => values.clear(),
        getAllKeys: () => [...values.keys()],
    };
};

const fakeVault = (values: Record<string, string>) => ({
    get: jest.fn(async (): Promise<NativeReadResult> => ({ status: 'available', values: { ...values } })),
    save: jest.fn(async () => true),
    clear: jest.fn(async () => true),
});

describe('mobile adapters', () => {
    it('names each adapter `<port>.<name>` in the port it fills', () => {
        const adapters = [
            transportMobile,
            foregroundAppState,
            authMobile({ leaveToHome: jest.fn() }),
            storageMobileVault({ vault: fakeVault({}), files: { plain: memoryFile(), device: memoryFile() } }),
            cacheMobileSqlite({ request: jest.fn() } as never),
        ];
        expect(adapters.map(adapter => [adapter.port, adapter.id])).toEqual([
            ['transport', 'transport.mobile'],
            ['foreground', 'foreground.app-state'],
            ['auth', 'auth.mobile'],
            ['storage', 'storage.mobile-vault'],
            ['cache', 'cache.mobile-sqlite'],
        ]);
        expect(adapters.every(adapter => adapter.supports === undefined)).toBe(true);
    });

    it('reads the host facts from the platform and the user agent the app resolved', () => {
        expect(mobileHostFacts({ userAgent: 'chatic-ua' })()).toEqual(facts);
    });

    it('sends the user agent from the facts with every socket device report', async () => {
        const transport = await transportMobile.create({ facts, storage: {} as RuntimePorts['storage'] });
        expect(transport.device()).toMatchObject({ userAgent: 'chatic-ua' });
    });

    it('carries the address a session ended with in the plain store it is handed', async () => {
        const leaveToHome = jest.fn();
        const plain = new MemoryStore();
        const storage = { secret: new MemoryStore(), plain, device: new MemoryStore() } as RuntimePorts['storage'];
        const auth = await authMobile({ leaveToHome }).create({ facts, storage });

        auth.leaveToHome(new URLSearchParams('logout=1'));
        expect(plain.get(HOME_SEARCH_KEY)).toBe('logout=1');
        expect(leaveToHome).toHaveBeenCalledTimes(1);
    });

    it('loads the vault before handing the stores over', async () => {
        const vault = fakeVault({ 'chatic-relay-token': 'token' });
        const storage = await storageMobileVault({
            vault,
            files: { plain: memoryFile(), device: memoryFile() },
        }).create({ facts });
        expect(vault.get).toHaveBeenCalled();
        expect(storage.secret.get('chatic-relay-token')).toBe('token');
    });

    it('stops the start when the vault holds no session, as the boot does', async () => {
        const plain = memoryFile();
        plain.set(HOME_SEARCH_KEY, 'logout=1');
        const onLoad = jest.fn();
        const adapter = storageMobileVault({ vault: fakeVault({}), files: { plain, device: memoryFile() }, onLoad });

        await expect(adapter.create({ facts })).rejects.toBeInstanceOf(NativeRuntimeNoSessionError);
        expect(plain.getString(HOME_SEARCH_KEY)).toBeUndefined();
        expect(onLoad).not.toHaveBeenCalled();
    });

    it('hands out how the vault was loaded, once it holds a session', async () => {
        const onLoad = jest.fn();
        await storageMobileVault({
            vault: fakeVault({ 'chatic-relay-token': 'token' }),
            files: { plain: memoryFile(), device: memoryFile() },
            onLoad,
        }).create({ facts });

        expect(onLoad).toHaveBeenCalledTimes(1);
        expect(onLoad).toHaveBeenCalledWith({
            vault: { status: 'available', values: { 'chatic-relay-token': 'token' } },
            secretStorage: 'vault',
        });
    });
});
