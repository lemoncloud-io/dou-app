import {
    reconcileInvitedCloudsIntoCold,
    recoverInvitedCloudIfMissing,
    syncInvitedCloudName,
} from './invitedCloudColdSync';

// Isolate the pure orchestration functions from the React hooks' dependencies.
jest.mock('../runtime', () => ({ useRuntimeRepositories: jest.fn(), useRuntimeSocketState: jest.fn() }));
jest.mock('./factories/localFactory', () => ({ isNativeApp: () => true }));

const mockIssue = jest.fn();
const mockUpsert = jest.fn();
const mockGetRegistry = jest.fn();

jest.mock('@chatic/web-core', () => ({
    issueCloudDelegationToken: (...args: unknown[]) => mockIssue(...args),
    upsertInvitedCloud: (...args: unknown[]) => mockUpsert(...args),
    getInvitedCloudRegistry: () => mockGetRegistry(),
    useSessionSelection: jest.fn(),
}));

const SEED_FLAG_KEY = 'chatic-invitecloud-cold-seeded';

const createCloud = () => ({
    cacheReadList: jest.fn().mockResolvedValue({ list: [] }),
    cacheWriteMany: jest.fn().mockResolvedValue(undefined),
    cacheWrite: jest.fn().mockResolvedValue(undefined),
    cacheRead: jest.fn().mockResolvedValue(null),
    getCloud: jest.fn().mockResolvedValue(null),
});

describe('invitedCloudColdSync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        mockGetRegistry.mockReturnValue([]);
    });

    describe('reconcileInvitedCloudsIntoCold', () => {
        it('backfills the registry from currently-cached invited clouds', async () => {
            const cloud = createCloud();
            cloud.cacheReadList.mockResolvedValue({
                list: [
                    { id: 'c1', name: 'One', cloudType: 'invited' },
                    { id: 'c2', name: 'Two', cloudType: 'owner' }, // owned → ignored
                ],
            });

            await reconcileInvitedCloudsIntoCold(cloud as any);

            expect(mockUpsert).toHaveBeenCalledTimes(1);
            expect(mockUpsert).toHaveBeenCalledWith({ cloudId: 'c1', name: 'One' });
        });

        it('seeds invited clouds into cold exactly once (guarded by the flag)', async () => {
            const cloud = createCloud();
            cloud.cacheReadList.mockResolvedValue({ list: [{ id: 'c1', name: 'One', cloudType: 'invited' }] });

            await reconcileInvitedCloudsIntoCold(cloud as any);
            expect(cloud.cacheWriteMany).toHaveBeenCalledTimes(1);
            expect(localStorage.getItem(SEED_FLAG_KEY)).toBe('1');

            // Second boot: flag set → no re-seed.
            await reconcileInvitedCloudsIntoCold(cloud as any);
            expect(cloud.cacheWriteMany).toHaveBeenCalledTimes(1);
        });

        it('marks seeded even when there is nothing to seed', async () => {
            const cloud = createCloud();
            await reconcileInvitedCloudsIntoCold(cloud as any);
            expect(cloud.cacheWriteMany).not.toHaveBeenCalled();
            expect(localStorage.getItem(SEED_FLAG_KEY)).toBe('1');
        });

        it('recovers a registry entry absent from the cache (endpoints only, name synced later)', async () => {
            const cloud = createCloud();
            cloud.cacheReadList.mockResolvedValue({ list: [] }); // cache DB wiped
            mockGetRegistry.mockReturnValue([{ cloudId: 'c9', name: 'Nine' }]);
            mockIssue.mockResolvedValue({ cloudId: 'c9', backend: 'https://b9', wss: 'wss://w9' });

            await reconcileInvitedCloudsIntoCold(cloud as any);

            expect(mockIssue).toHaveBeenCalledWith('c9');
            expect(cloud.cacheWrite).toHaveBeenCalledWith({
                id: 'c9',
                cid: 'c9',
                backend: 'https://b9',
                wss: 'wss://w9',
                cloudType: 'invited',
            });
        });

        it('does not re-derive a registry entry already present in the cache', async () => {
            const cloud = createCloud();
            cloud.cacheReadList.mockResolvedValue({ list: [{ id: 'c9', cloudType: 'invited' }] });
            mockGetRegistry.mockReturnValue([{ cloudId: 'c9' }]);

            await reconcileInvitedCloudsIntoCold(cloud as any);

            expect(mockIssue).not.toHaveBeenCalled();
        });

        it('skips a registry entry whose relay grant is gone (issue rejects)', async () => {
            const cloud = createCloud();
            mockGetRegistry.mockReturnValue([{ cloudId: 'gone' }]);
            mockIssue.mockRejectedValue(new Error('403 FORBIDDEN'));

            await expect(reconcileInvitedCloudsIntoCold(cloud as any)).resolves.toBeUndefined();
            expect(cloud.cacheWrite).not.toHaveBeenCalled();
        });
    });

    describe('recoverInvitedCloudIfMissing', () => {
        it('no-ops on an empty cid', async () => {
            const cloud = createCloud();
            await recoverInvitedCloudIfMissing(cloud as any, undefined);
            expect(cloud.cacheRead).not.toHaveBeenCalled();
            expect(mockIssue).not.toHaveBeenCalled();
        });

        it('no-ops when the cloud is already cached', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue({ id: 'c1', cloudType: 'invited' });
            await recoverInvitedCloudIfMissing(cloud as any, 'c1');
            expect(mockIssue).not.toHaveBeenCalled();
        });

        it('re-derives a missing cloud (endpoints only; name is synced on connect)', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue(null);
            mockIssue.mockResolvedValue({ cloudId: 'c1', backend: 'https://b', wss: 'wss://w' });

            await recoverInvitedCloudIfMissing(cloud as any, 'c1');

            expect(mockIssue).toHaveBeenCalledWith('c1');
            expect(cloud.cacheWrite).toHaveBeenCalledWith({
                id: 'c1',
                cid: 'c1',
                backend: 'https://b',
                wss: 'wss://w',
                cloudType: 'invited',
            });
        });
    });

    describe('syncInvitedCloudName', () => {
        it('no-ops on an empty cid', async () => {
            const cloud = createCloud();
            await syncInvitedCloudName(cloud as any, undefined);
            expect(cloud.getCloud).not.toHaveBeenCalled();
        });

        it('no-ops when the active cloud is not an invited row', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue({ id: 'c1', cloudType: 'owner' });
            await syncInvitedCloudName(cloud as any, 'c1');
            expect(cloud.getCloud).not.toHaveBeenCalled();
        });

        it('fetches and persists the fresh name when it differs', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue({ id: 'c1', cid: 'c1', name: 'Old', cloudType: 'invited' });
            cloud.getCloud.mockResolvedValue({ id: 'c1', name: 'Fresh' });

            await syncInvitedCloudName(cloud as any, 'c1');

            expect(cloud.getCloud).toHaveBeenCalledWith({ id: 'c1' });
            expect(cloud.cacheWrite).toHaveBeenCalledWith({
                id: 'c1',
                cid: 'c1',
                name: 'Fresh',
                cloudType: 'invited',
            });
            expect(mockUpsert).toHaveBeenCalledWith({ cloudId: 'c1', name: 'Fresh' });
        });

        it('no-ops when the fetched name is unchanged', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue({ id: 'c1', name: 'Same', cloudType: 'invited' });
            cloud.getCloud.mockResolvedValue({ id: 'c1', name: 'Same' });

            await syncInvitedCloudName(cloud as any, 'c1');

            expect(cloud.cacheWrite).not.toHaveBeenCalled();
        });

        it('best-effort: swallows a getCloud failure', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue({ id: 'c1', name: 'Old', cloudType: 'invited' });
            cloud.getCloud.mockRejectedValue(new Error('socket not ready'));

            await expect(syncInvitedCloudName(cloud as any, 'c1')).resolves.toBeUndefined();
            expect(cloud.cacheWrite).not.toHaveBeenCalled();
        });
    });
});
