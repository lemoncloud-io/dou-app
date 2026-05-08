import { UserRepository } from './UserRepository';

describe('UserRepository', () => {
    const payload = { channelId: 'ch-1', page: 0, limit: 20 } as any;

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            fetchUsers: jest.fn(),
            updateProfile: jest.fn(),
            requestInvite: jest.fn(),
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

        const requestManager = {
            request: jest.fn(async (sendAction: (ref: string) => void) => {
                sendAction('ref-1');
                return {
                    list: [{ id: 'u1', cid: 'cloud-a' }],
                    total: 1,
                };
            }),
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

        const repository = new UserRepository(
            remote as any,
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, remote, local, requestManager };
    };

    it('returns local first for cache-first and runs remote refresh in background', async () => {
        const localResult = { list: [{ id: 'u-local' }], meta: { total: 1, source: 'local' } };
        const { repository, remote, requestManager } = createRepository({ localResult });

        const result = await repository.fetchUsers(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchUsers).toHaveBeenCalledTimes(1);
        expect(requestManager.request).toHaveBeenCalledTimes(1);
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
