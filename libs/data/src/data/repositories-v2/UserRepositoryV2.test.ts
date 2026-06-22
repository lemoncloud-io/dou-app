import { UserRepositoryV2 } from './UserRepositoryV2';

const createEventBus = () => {
    const listeners = new Map<string, Set<(payload: any) => void>>();
    return {
        on(event: string, callback: (payload: any) => void) {
            const group = listeners.get(event) ?? new Set<(payload: any) => void>();
            group.add(callback);
            listeners.set(event, group);
            return () => {
                group.delete(callback);
                if (group.size === 0) listeners.delete(event);
            };
        },
        emit(event: string, payload: any) {
            for (const callback of listeners.get(event) ?? []) {
                callback(payload);
            }
        },
        onAny: jest.fn(() => () => undefined),
    };
};

describe('UserRepositoryV2', () => {
    const createRepository = () => {
        // User repository mixes cache writes and helper passthroughs, so keep each collaborator fully isolated.
        const userRemoteDataSource = {
            fetchUsers: jest.fn(),
            updateProfile: jest.fn(),
            requestInvite: jest.fn(),
            inviteBatch: jest.fn(),
            syncChannelUsers: jest.fn(),
        };
        const userLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        return {
            repository: new UserRepositoryV2(
                userRemoteDataSource as any,
                userLocalDataSource as any,
                contextProvider,
                domainEventBus as any
            ),
            userRemoteDataSource,
            userLocalDataSource,
        };
    };

    it('writes synced channel users into the local cache with the active cloud scope', async () => {
        const { repository, userRemoteDataSource, userLocalDataSource } = createRepository();
        userRemoteDataSource.syncChannelUsers.mockResolvedValue({
            list: [{ id: 'u1', name: 'Alice' }],
        });

        const result = await repository.refreshChannelUsers({ channelId: 'ch-1' } as any);

        // Channel user sync should become a local cache write, not a passthrough list for rendering.
        expect(userLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'u1', cid: 'cloud-a' })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual({ wroteCount: 1 });
    });

    it('rolls back an optimistic profile patch when updateProfile fails', async () => {
        const { repository, userRemoteDataSource, userLocalDataSource } = createRepository();
        userLocalDataSource.cacheRead.mockResolvedValue({ id: 'u1', name: 'Before' });
        userRemoteDataSource.updateProfile.mockRejectedValue(new Error('boom'));

        await expect(repository.updateProfile({ userId: 'u1', name: 'After' } as any)).rejects.toThrow('boom');

        // The rollback should restore the original cached user after the failed mutation.
        expect(userLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'u1', name: 'Before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('passes invite helper calls straight to the remote datasource', async () => {
        const { repository, userRemoteDataSource } = createRepository();
        userRemoteDataSource.requestInvite.mockResolvedValue({ code: 'invite-1' });
        userRemoteDataSource.inviteBatch.mockResolvedValue({ list: [{ code: 'invite-2' }] });

        // Invite helpers should remain passthroughs so callers see the backend contract directly.
        await expect(repository.requestInvite({ alias: 'a' } as any)).resolves.toEqual({ code: 'invite-1' });
        await expect(repository.requestInviteBatch({ alias: 'a' } as any)).resolves.toEqual([{ code: 'invite-2' }]);
    });

    it('stops reacting to domain events after dispose is called', async () => {
        const userRemoteDataSource = {
            fetchUsers: jest.fn(),
            updateProfile: jest.fn(),
            requestInvite: jest.fn(),
            inviteBatch: jest.fn(),
            syncChannelUsers: jest.fn(),
        };
        const userLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn().mockResolvedValue(undefined),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const eventBus = createEventBus();
        const repository = new UserRepositoryV2(
            userRemoteDataSource as any,
            userLocalDataSource as any,
            {
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
                setContext: () => undefined,
            },
            eventBus as any
        );

        repository.dispose();
        eventBus.emit('user:update', { data: { id: 'u1', name: 'After' } });
        await Promise.resolve();

        expect(userLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });
});
