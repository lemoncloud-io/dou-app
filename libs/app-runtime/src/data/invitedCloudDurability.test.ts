import { recoverInvitedCloudIfMissing, syncInvitedCloudName } from './invitedCloudDurability';

// Isolate the pure orchestration functions from the React hooks' dependencies.
jest.mock('../runtime', () => ({ useRuntimeRepositories: jest.fn(), useRuntimeSocketState: jest.fn() }));
jest.mock('./cacheStorageRouting', () => ({ isNativeApp: () => true }));

const mockIssue = jest.fn();

// `delegateCloud`는 `auth` repository에서 온다 — data가 세션 폴더를 되짚을 이유가 없어졌다.
jest.mock('./runtime', () => ({
    getRepositories: () => ({ auth: { delegateCloud: (...args: unknown[]) => mockIssue(...args) } }),
}));
jest.mock('../session', () => ({ useSessionSelection: jest.fn() }));

const createCloud = () => ({
    cacheReadList: jest.fn().mockResolvedValue({ list: [] }),
    cacheWriteMany: jest.fn().mockResolvedValue(undefined),
    cacheWrite: jest.fn().mockResolvedValue(undefined),
    cacheRead: jest.fn().mockResolvedValue(null),
    getCloud: jest.fn().mockResolvedValue(null),
});

describe('invitedCloudDurability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('recoverInvitedCloudIfMissing (push safety net)', () => {
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

        it('best-effort: swallows a relay failure', async () => {
            const cloud = createCloud();
            cloud.cacheRead.mockResolvedValue(null);
            mockIssue.mockRejectedValue(new Error('403 FORBIDDEN'));

            await expect(recoverInvitedCloudIfMissing(cloud as any, 'c1')).resolves.toBeUndefined();
            expect(cloud.cacheWrite).not.toHaveBeenCalled();
        });
    });

    describe('syncInvitedCloudName (authoritative name via cloud.get)', () => {
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
