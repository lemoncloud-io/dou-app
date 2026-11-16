import { MemoryStore } from '@chatic/storage';

import { createNativeRuntime } from './createNativeRuntime';

import type { RuntimeConfig } from '@chatic/runtime-core';

import type { NativeRuntimeOptions } from './createNativeRuntime';

const mockEngine = { id: 'engine' };
const mockCreateRuntime = jest.fn((_config: unknown) => mockEngine);
jest.mock('@chatic/runtime-core', () => ({ createRuntime: (config: unknown) => mockCreateRuntime(config) }));
jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: () => () => undefined },
}));
jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
}));

const options = (overrides: Partial<NativeRuntimeOptions> = {}): NativeRuntimeOptions => ({
    storage: { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() },
    cache: { id: 'cache-ports' } as unknown as NativeRuntimeOptions['cache'],
    userAgent: 'DoU/1.0 (DOU_ANDROID)',
    leaveToHome: jest.fn(),
    ...overrides,
});

const globalRef = globalThis as { crypto?: unknown };
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: () => undefined },
        configurable: true,
        writable: true,
    });
});

afterAll(() => {
    if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto);
});

describe('createNativeRuntime', () => {
    it("builds the runtime from the app's stores and cache and the native ports, and returns its engine", () => {
        const given = options();

        const engine = createNativeRuntime(given);

        expect(engine).toBe(mockEngine);
        const config = mockCreateRuntime.mock.calls[0][0] as RuntimeConfig;
        expect(config.storage).toBe(given.storage);
        expect(config.cache).toBe(given.cache);
        expect(config.transport.device()).toEqual({ appPlatform: 'android', userAgent: 'DoU/1.0 (DOU_ANDROID)' });
        expect(config.foreground.read()).toBe(true);
        expect(config.auth.currentSearch()).toBe('');
        config.auth.leaveToHome(new URLSearchParams('logout=1'));
        expect(given.leaveToHome).toHaveBeenCalledTimes(1);
        // The flag waits in the app's own plain store, so the next launch's boot sweep reads it.
        expect(given.storage.plain.keys()).toHaveLength(1);
    });

    it("passes the app's own policies through as they are", () => {
        const data = { cache: { maxChatsPerChannel: 1000 } };

        createNativeRuntime(options({ signedOutKeyPrefixes: ['log:'], data }));

        expect(mockCreateRuntime).toHaveBeenCalledWith(
            expect.objectContaining({ signedOutKeyPrefixes: ['log:'], data })
        );
    });

    it('refuses to build the runtime when the polyfill entry was not imported', () => {
        globalRef.crypto = undefined;

        expect(() => createNativeRuntime(options())).toThrow('@chatic/runtime-mobile/polyfills');
        expect(mockCreateRuntime).not.toHaveBeenCalled();
    });
});
