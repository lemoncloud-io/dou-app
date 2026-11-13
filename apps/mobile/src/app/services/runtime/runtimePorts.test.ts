/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
import type { DataContextProvider } from '@chatic/data';

import type { ICacheCrudService, ICacheSearchService } from '../cache/types';
import type { ILogService } from '../log';
import { buildRuntimePorts } from './runtimePorts';

// The runtime package reads these at import; nothing here reaches them.
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(), fetch: jest.fn() }));

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const fakeFile = () => {
    const entries = new Map<string, string>();
    return {
        entries,
        getString: (key: string) => entries.get(key),
        set: (key: string, value: string) => void entries.set(key, value),
        remove: (key: string) => entries.delete(key),
        clearAll: () => entries.clear(),
        getAllKeys: () => [...entries.keys()],
    };
};

const setup = () => {
    const vault = {
        get: jest.fn(async () => ({ status: 'available' as const, values: { 'chatic-relay-token': 't' } })),
        save: jest.fn(async () => true),
        clear: jest.fn(async () => true),
    };
    const files = { plain: fakeFile(), device: fakeFile() };
    const crud = { fetch: jest.fn(async () => ({ id: 'u9' })) } as unknown as ICacheCrudService;
    const search = {} as ICacheSearchService;
    const ports = buildRuntimePorts({ vault, files, cache: { crud: () => crud, search: () => search, logger } });
    return { vault, files, crud, ports };
};

describe('buildRuntimePorts', () => {
    it('reads the secrets the pages keep in the vault, once loaded', async () => {
        const { ports, vault } = setup();

        await ports.storage.secret.hydrate();
        expect(ports.storage.secret.get('chatic-relay-token')).toBe('t');

        ports.storage.secret.set('chatic-cloud-token', 'c');
        await ports.storage.secret.flush();
        expect(vault.save).toHaveBeenCalledWith({ 'chatic-cloud-token': 'c' }, []);
    });

    it('keeps plain and device values in their own files', () => {
        const { ports, files } = setup();

        ports.storage.plain.set('chatic-selected-cloud-id', 'c1');
        ports.storage.device.set('draft', '{"text":"hi"}');

        expect(files.plain.entries.get('chatic-selected-cloud-id')).toBe('c1');
        expect(files.device.entries.get('draft')).toBe('{"text":"hi"}');
        expect(files.plain.entries.has('draft')).toBe(false);
    });

    it("reads the cache from the app's database", async () => {
        const { ports, crud } = setup();
        const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }) } as unknown as DataContextProvider;

        const users = ports.cache.storage('user', ports.cache.route('user'), context, undefined);

        await expect(users.load('u9')).resolves.toEqual({ id: 'u9' });
        expect(crud.fetch).toHaveBeenCalledWith({ type: 'user', cid: 'c1', uid: 'u1', id: 'u9' });
    });
});
