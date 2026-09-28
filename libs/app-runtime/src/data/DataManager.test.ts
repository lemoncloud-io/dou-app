/**
 * The scoped repository graph: what a sync plan (and later a cloud-addressed send) writes through
 * when the cloud it serves is not necessarily the selected one.
 */
import type { DataContextProvider } from '@chatic/data';

import { DataManager } from './DataManager';

const mockCreateRepositories = jest.fn();
jest.mock('@chatic/data', () => ({
    ...jest.requireActual('@chatic/data'),
    createRepositories: (...args: unknown[]) => mockCreateRepositories(...args),
}));

const mockLocalDataSources = { tag: 'local' };
jest.mock('./factories/localFactory', () => ({ createLocalDataSources: () => mockLocalDataSources }));

const mockHttpDataSources = { tag: 'http' };
jest.mock('./factories/httpFactory', () => ({
    createHttpDataSources: () => ({ httpDataSources: mockHttpDataSources }),
}));

const mockCreateSocketDataSources = jest.fn((client?: unknown) => ({ socketDataSources: { client } }));
jest.mock('./factories/socketFactory', () => ({
    createSocketDataSources: (client?: unknown) => mockCreateSocketDataSources(client),
}));

const mockScopedClients = new Map<string, object>();
const mockGetScopedClient = jest.fn((key: string) => {
    if (!mockScopedClients.has(key)) mockScopedClients.set(key, { slot: key });
    return mockScopedClients.get(key);
});
jest.mock('../socket/runtime', () => ({
    getSocketManager: () => ({ getScopedClient: mockGetScopedClient, getBoundCid: () => 'cloud-a' }),
}));

const mockUids: Record<string, string | null> = {};
jest.mock('../session/store', () => ({
    getCommittedCloudId: () => 'cloud-a',
    getUidInCloud: (cid: string) => mockUids[cid] ?? null,
}));

jest.mock('../session/scope', () => ({
    deriveSelectedContext: () => ({ cid: 'cloud-a', uid: 'uid-a' }),
    ActiveScope: jest.fn().mockImplementation(() => ({ tag: 'active-scope' })),
}));

type AssemblyArgs = {
    socketDataSources: { client?: unknown };
    localDataSources: unknown;
    context: DataContextProvider;
    options: unknown;
    httpDataSources: unknown;
};

const assemblyOf = (repositories: unknown): AssemblyArgs => {
    const index = mockCreateRepositories.mock.results.findIndex(result => result.value === repositories);
    return mockCreateRepositories.mock.calls[index][0] as AssemblyArgs;
};

beforeEach(() => {
    mockCreateRepositories.mockReset().mockImplementation(() => ({ id: Symbol('repositories') }));
    mockCreateSocketDataSources.mockClear();
    mockGetScopedClient.mockClear();
    mockScopedClients.clear();
    for (const key of Object.keys(mockUids)) delete mockUids[key];
});

describe('DataManager.getScopedRepositories', () => {
    it('builds one graph per cloud and hands the same one back afterwards', () => {
        const manager = new DataManager();

        const first = manager.getScopedRepositories('cloud-b');

        expect(manager.getScopedRepositories('cloud-b')).toBe(first);
        expect(manager.getScopedRepositories('cloud-c')).not.toBe(first);
        // One app graph plus the two scoped ones.
        expect(mockCreateRepositories).toHaveBeenCalledTimes(3);
    });

    it('is not the app graph, even for the cloud that is active', () => {
        const manager = new DataManager();

        expect(manager.getScopedRepositories('cloud-a')).not.toBe(manager.getRepositories());
    });

    it("sends through that cloud's own slot, never the active facade", () => {
        const manager = new DataManager();

        const repositories = manager.getScopedRepositories('cloud-b');

        expect(mockGetScopedClient).toHaveBeenCalledWith('cloud-b');
        expect(assemblyOf(repositories).socketDataSources.client).toBe(mockScopedClients.get('cloud-b'));
        // The app graph was assembled with the default (active-facade) client.
        expect(assemblyOf(manager.getRepositories()).socketDataSources.client).toBeUndefined();
    });

    it('shares the local and HTTP sources and repository options with the app graph', () => {
        const options = { user: {} } as never;
        const manager = new DataManager(options);

        const scoped = assemblyOf(manager.getScopedRepositories('cloud-b'));
        const app = assemblyOf(manager.getRepositories());

        expect(scoped.localDataSources).toBe(mockLocalDataSources);
        expect(app.localDataSources).toBe(mockLocalDataSources);
        expect(scoped.httpDataSources).toBe(mockHttpDataSources);
        expect(scoped.options).toBe(options);
    });

    it("runs under that cloud and this account's uid there, read at call time", () => {
        const manager = new DataManager();
        const { context } = assemblyOf(manager.getScopedRepositories('cloud-b'));

        expect(context.getContext()).toEqual({ cid: 'cloud-b', uid: undefined, socketCid: 'cloud-b' });

        // The identity lands after the graph exists — the graph must see it without a rebuild.
        mockUids['cloud-b'] = 'uid-b';
        expect(context.getContext()).toEqual({ cid: 'cloud-b', uid: 'uid-b', socketCid: 'cloud-b' });
    });

    it('rejects a word that is not a cloud id, as a slot key does', () => {
        const manager = new DataManager();

        expect(() => manager.getScopedRepositories('cloud')).toThrow(/not a cloud id/);
    });
});

describe('DataManager.getScopedContext', () => {
    it('names the relay partition for the relay', () => {
        mockUids.default = 'relay-uid';
        const manager = new DataManager();

        expect(manager.getScopedContext('default')).toEqual({
            cid: 'default',
            uid: 'relay-uid',
            socketCid: 'default',
        });
    });
});
