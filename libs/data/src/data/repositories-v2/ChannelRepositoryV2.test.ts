import { ChannelRepositoryV2 } from './ChannelRepositoryV2';

describe('ChannelRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote and local collaborators independently so orchestration behavior is easy to assert.
        const channelRemoteDataSource = {
            fetchChannel: jest.fn(),
            syncChannel: jest.fn(),
            createChannel: jest.fn(),
            updateChannel: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getSelfChannel: jest.fn(),
            getUnreads: jest.fn(),
        };
        const channelLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new ChannelRepositoryV2(
                channelRemoteDataSource as any,
                channelLocalDataSource as any,
                contextProvider
            ),
            channelRemoteDataSource,
            channelLocalDataSource,
        };
    };

    it('delegates read and cache helper methods to the local datasource with the runtime context', async () => {
        const { repository, channelLocalDataSource } = createRepository();

        await repository.cacheRead('ch-1');
        await repository.cacheReadList({ sid: 'site-1' } as any);
        await repository.cacheWrite({ id: 'ch-1' } as any);
        await repository.cacheWriteMany([{ id: 'ch-1' }] as any);
        await repository.cacheDelete('ch-1');
        await repository.cacheClear();

        // Helper methods should stay thin wrappers so hooks can rely on a consistent context-bound API.
        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(channelLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('refreshList — fetchChannel 스냅샷을 로컬 캐시에 병합한다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.fetchChannel.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-2', sid: 'site-1' },
            ],
        });

        await repository.refreshList({ sid: 'site-1', detail: true, limit: 100 } as any);

        expect(channelRemoteDataSource.fetchChannel).toHaveBeenCalledWith(
            { sid: 'site-1', detail: true, limit: 100 },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-2', sid: 'site-1' },
            ],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('refreshList — 나간 채널과 id 없는 행은 병합에서 제외한다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        // Leaving marks the channel locally; a lagging server snapshot must not resurrect it.
        channelRemoteDataSource.leaveChannel.mockResolvedValue({ id: 'ch-left' });
        await repository.leaveChannel({ channelId: 'ch-left' } as any);
        channelLocalDataSource.cacheWriteMany.mockClear();

        channelRemoteDataSource.fetchChannel.mockResolvedValue({
            list: [{ id: 'ch-left', sid: 'site-1' }, { sid: 'site-1' }, { id: 'ch-3', sid: 'site-1' }],
        });

        await repository.refreshList({ sid: 'site-1' } as any);

        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-3', sid: 'site-1' }],
            expect.anything()
        );
    });

    it('leaveChannel — 본인 나가기(userId 없음)는 채널을 로컬 캐시에서 제거한다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — 멤버 추방(userId 있음)은 내 채널 캐시를 evict하지 않는다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        // Owner kicking another member: I stay in the room, so the channel must remain cached
        // and must not be marked as left (a lagging snapshot must still resurrect it for me).
        channelRemoteDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1', userId: 'other-user' } as any);

        expect(channelLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        expect(channelRemoteDataSource.leaveChannel).toHaveBeenCalledWith(
            { channelId: 'ch-1', userId: 'other-user' },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );

        // The kicked channel is NOT filtered out of a subsequent snapshot merge.
        channelRemoteDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        await repository.refreshList({ sid: 'site-1' } as any);
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-1', sid: 'site-1' }],
            expect.anything()
        );
    });

    it('refreshList — 빈 스냅샷이면 캐시를 건드리지 않는다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.fetchChannel.mockResolvedValue({ list: [] });

        await repository.refreshList();

        expect(channelLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
    });

    it('getSelfChannel: 원격 조회 결과(나와의 채팅)를 로컬 캐시에 기록하고 반환한다', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel', sid: 'site-1' });

        await expect(repository.getSelfChannel({} as any)).resolves.toEqual({ id: 'self-channel', sid: 'site-1' });
        // The self channel must land in the cache so the channel list observers pick it up.
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            { id: 'self-channel', sid: 'site-1' },
            expect.anything()
        );
    });

    it('getUnreads: 로컬 캐시를 건드리지 않는 pass-through', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.getUnreads.mockResolvedValue({ total: 3 });

        await expect(repository.getUnreads({} as any)).resolves.toEqual({ total: 3 });
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });
});
