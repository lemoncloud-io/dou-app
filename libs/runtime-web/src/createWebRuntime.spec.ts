import { MemoryStore } from '@chatic/storage';

import { createWebRuntime } from './createWebRuntime';

const mockEngine = { id: 'engine' };
const mockCreateRuntime = jest.fn((_config: unknown) => mockEngine);
jest.mock('@chatic/runtime-core', () => ({ createRuntime: (config: unknown) => mockCreateRuntime(config) }));
const mockCachePorts = { id: 'cache-ports' };
const mockWebLocalCachePorts = jest.fn((_tab: unknown) => mockCachePorts);
jest.mock('./localCache', () => ({ webLocalCachePorts: (tab: unknown) => mockWebLocalCachePorts(tab) }));

const storage = () => ({ secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() });

beforeEach(() => jest.clearAllMocks());

describe('createWebRuntime', () => {
    it("builds the runtime from the app's stores and the page's ports, and returns its engine", () => {
        const stores = storage();
        const cacheTab = new MemoryStore();

        const engine = createWebRuntime({ storage: stores, cacheTab });

        expect(engine).toBe(mockEngine);
        const config = mockCreateRuntime.mock.calls[0][0] as Record<string, unknown>;
        expect(config.storage).toBe(stores);
        for (const port of ['transport', 'auth', 'foreground']) {
            expect(config[port]).toBeDefined();
        }
        // The cache's tab store is the app's own pick — raw, not the tolerant `tab` — and goes nowhere else.
        expect(mockWebLocalCachePorts).toHaveBeenCalledWith(cacheTab);
        expect(config.cache).toBe(mockCachePorts);
        expect((config.foreground as { read: () => boolean }).read()).toBe(document.visibilityState === 'visible');
    });

    it("passes the app's own policies through as they are", () => {
        const data = { cache: { maxChatsPerChannel: 1000 } };

        createWebRuntime({ storage: storage(), cacheTab: new MemoryStore(), signedOutKeyPrefixes: ['log:'], data });

        expect(mockCreateRuntime).toHaveBeenCalledWith(
            expect.objectContaining({ signedOutKeyPrefixes: ['log:'], data })
        );
    });
});
