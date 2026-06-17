import { UserRepository } from './UserRepository';

describe('UserRepository', () => {
    const payload = { channelId: 'ch-1', page: 0, limit: 20 } as any;

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            fetchUsers: jest.fn().mockResolvedValue({
                list: [{ id: 'u1', cid: 'cloud-a' }],
                total: 1,
            }),
            updateProfile: jest.fn(),
            requestInvite: jest.fn(),
            requestInviteBatch: jest.fn(),
            handleModelEvent: jest.fn(),
        };

        const local = {
            fetchList: jest.fn(async () => localResult),
            getById: jest.fn(),
            getUsers: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new UserRepository(remote as any, local as any, contextProvider, domainEventBus as any);

        return { repository, remote, local };
    };

    it('returns local first for cache-first and runs remote refresh in background', async () => {
        const localResult = { list: [{ id: 'u-local' }], meta: { total: 1, source: 'local' } };
        const { repository, remote } = createRepository({ localResult });

        const result = await repository.fetchUsers(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchUsers).toHaveBeenCalledTimes(1);
    });

    it('delegates subscribeList to local data source with repository context', () => {
        const { repository, local } = createRepository({ localResult: null });
        const callback = jest.fn();

        repository.subscribeList(payload, callback);

        expect(local.subscribeList).toHaveBeenCalledWith(payload, callback, {
            cid: 'cloud-a',
            uid: 'user-a',
        });
    });
});
