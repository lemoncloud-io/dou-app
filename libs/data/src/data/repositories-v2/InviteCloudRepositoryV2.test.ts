import { InviteCloudRepositoryV2 } from './InviteCloudRepositoryV2';

describe('InviteCloudRepositoryV2', () => {
    it('returns an empty local result when no invite clouds are cached yet', async () => {
        const inviteCloudLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn().mockResolvedValue(null),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new InviteCloudRepositoryV2(inviteCloudLocalDataSource as any, contextProvider);

        const result = await repository.cacheReadList();

        // The local-only repository should still expose a stable empty list contract.
        expect(result).toEqual({
            list: [],
            meta: { total: 0, source: 'local' },
        });
    });

    it('delegates cache helper methods to the local-only datasource', async () => {
        const inviteCloudLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const repository = new InviteCloudRepositoryV2(inviteCloudLocalDataSource as any, {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        });

        await repository.cacheRead('cloud-1');
        await repository.cacheWrite({ id: 'cloud-1' } as any);
        await repository.cacheWriteMany([{ id: 'cloud-1' }] as any);
        await repository.cacheDelete('cloud-1');
        await repository.cacheClear();

        // Even local-only repositories should preserve the context-bound helper contract.
        expect(inviteCloudLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });
});
