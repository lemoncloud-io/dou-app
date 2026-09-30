import { clearLocalCaches } from './clearLocalCaches';

const mockGetScopedRepositories = jest.fn();
jest.mock('./runtime', () => ({
    getDataManager: () => ({ getScopedRepositories: mockGetScopedRepositories }),
}));

const mockIdentities: { value: Record<string, { uid: string }> } = { value: {} };
const mockCommitted: { value: string | null } = { value: null };
jest.mock('../session/store', () => ({
    getCommittedCloudId: () => mockCommitted.value,
    getRecordedCloudIds: () => Object.keys(mockIdentities.value),
}));

const mockRequestSyncCursorReset = jest.fn();
jest.mock('./syncCursorWatermark', () => ({ requestSyncCursorReset: () => mockRequestSyncCursorReset() }));

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const DOMAINS = ['channel', 'chat', 'cloud', 'invite', 'join', 'place', 'profile', 'user', 'syncMeta'] as const;

/** One scoped graph per cloud, each domain's cacheClear a separate mock so a test can tell them apart. */
const graphs = new Map<string, Record<(typeof DOMAINS)[number], { cacheClear: jest.Mock }>>();
const graphOf = (cid: string) => {
    let graph = graphs.get(cid);
    if (!graph) {
        graph = Object.fromEntries(
            DOMAINS.map(name => [name, { cacheClear: jest.fn().mockResolvedValue(undefined) }])
        ) as Record<(typeof DOMAINS)[number], { cacheClear: jest.Mock }>;
        graphs.set(cid, graph);
    }
    return graph;
};

beforeEach(() => {
    graphs.clear();
    mockIdentities.value = {};
    mockCommitted.value = null;
    mockGetScopedRepositories.mockReset().mockImplementation(graphOf);
    mockRequestSyncCursorReset.mockReset();
});

describe('clearLocalCaches', () => {
    it('sweeps the relay and every cloud this account has an identity in', async () => {
        mockIdentities.value = { 'cloud-a': { uid: 'ua' }, 'cloud-b': { uid: 'ub' } };

        const result = await clearLocalCaches();

        expect(result).toEqual({ clouds: ['default', 'cloud-a', 'cloud-b'], failures: 0 });
        for (const cid of ['default', 'cloud-a', 'cloud-b']) {
            expect(graphOf(cid).chat.cacheClear).toHaveBeenCalledTimes(1);
        }
    });

    it('clears every refillable domain and its sync cursors', async () => {
        await clearLocalCaches();

        const relay = graphOf('default');
        for (const name of ['channel', 'chat', 'join', 'place', 'profile', 'user', 'syncMeta'] as const) {
            expect(relay[name].cacheClear).toHaveBeenCalledTimes(1);
        }
    });

    it("clears a cloud's sync cursors only after its data clears have settled", async () => {
        let releaseChat: () => void = () => undefined;
        const relay = graphOf('default');
        relay.chat.cacheClear.mockReturnValue(new Promise<void>(resolve => (releaseChat = resolve)));

        const pending = clearLocalCaches();
        await Promise.resolve();
        expect(relay.syncMeta.cacheClear).not.toHaveBeenCalled();

        releaseChat();
        await pending;
        expect(relay.syncMeta.cacheClear).toHaveBeenCalledTimes(1);
    });

    it('still clears the cursors when a data clear failed, so the rows left behind re-sync in full', async () => {
        graphOf('default').chat.cacheClear.mockRejectedValue(new Error('bridge down'));

        await clearLocalCaches();

        expect(graphOf('default').syncMeta.cacheClear).toHaveBeenCalledTimes(1);
    });

    it('asks the next boot to retire every cursor, even after a partial failure', async () => {
        graphOf('default').chat.cacheClear.mockRejectedValue(new Error('bridge down'));

        await clearLocalCaches();

        expect(mockRequestSyncCursorReset).toHaveBeenCalledTimes(1);
    });

    it('never clears invited clouds or invite dismissals — the cache is their only copy', async () => {
        mockIdentities.value = { 'cloud-a': { uid: 'ua' } };

        await clearLocalCaches();

        for (const cid of ['default', 'cloud-a']) {
            expect(graphOf(cid).cloud.cacheClear).not.toHaveBeenCalled();
            expect(graphOf(cid).invite.cacheClear).not.toHaveBeenCalled();
        }
    });

    it('adds the committed cloud even before its identity is recorded, and sweeps each cloud once', async () => {
        mockIdentities.value = { 'cloud-a': { uid: 'ua' } };
        mockCommitted.value = 'cloud-c';

        await expect(clearLocalCaches()).resolves.toEqual({
            clouds: ['default', 'cloud-a', 'cloud-c'],
            failures: 0,
        });

        mockCommitted.value = 'cloud-a';
        mockGetScopedRepositories.mockClear();
        await clearLocalCaches();
        expect(mockGetScopedRepositories.mock.calls.map(([cid]) => cid)).toEqual(['default', 'cloud-a']);
    });

    it('keeps clearing past a failure and reports how many failed', async () => {
        mockIdentities.value = { 'cloud-a': { uid: 'ua' } };
        graphOf('default').chat.cacheClear.mockRejectedValue(new Error('bridge down'));

        const result = await clearLocalCaches();

        expect(result.failures).toBe(1);
        expect(graphOf('default').channel.cacheClear).toHaveBeenCalled();
        expect(graphOf('cloud-a').chat.cacheClear).toHaveBeenCalled();
    });
});
