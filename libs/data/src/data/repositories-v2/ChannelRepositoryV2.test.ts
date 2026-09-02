import { ChannelRepositoryV2 } from './ChannelRepositoryV2';

describe('ChannelRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote and local collaborators independently so orchestration behavior is easy to assert.
        const channelSocketDataSource = {
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
                channelSocketDataSource as any,
                channelLocalDataSource as any,
                contextProvider
            ),
            channelSocketDataSource,
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

    it('inviteChannel — 초대한 id를 라운드트립 전에 memberIds에 낙관적으로 쓴다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockResolvedValue({ id: 'ch-1', sid: 'site-1', memberIds: ['me'] });
        // 서버 응답이 멤버 목록을 생략해도 초대한 id가 유실되면 안 된다 (leaveChannel과 같은 방어).
        channelSocketDataSource.inviteChannel.mockResolvedValue({ id: 'ch-1', sid: 'site-1' });

        const result = await repository.inviteChannel({ channelId: 'ch-1', userIds: ['u-2', 'u-3'] } as any);

        expect(channelLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            1,
            { id: 'ch-1', memberIds: ['me', 'u-2', 'u-3'] },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            2,
            { id: 'ch-1', sid: 'site-1', memberIds: ['me', 'u-2', 'u-3'] },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result.memberIds).toEqual(['me', 'u-2', 'u-3']);
    });

    it('inviteChannel — 실패하면 초대 전 채널 레코드를 되돌린다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        const existing = { id: 'ch-1', sid: 'site-1', memberIds: ['me'] };
        channelLocalDataSource.cacheRead.mockResolvedValue(existing);
        channelSocketDataSource.inviteChannel.mockRejectedValue(new Error('denied'));

        await expect(repository.inviteChannel({ channelId: 'ch-1', userIds: ['u-2'] } as any)).rejects.toThrow(
            'denied'
        );

        expect(channelLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(existing, {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('refreshList — fetchChannel 스냅샷을 로컬 캐시에 병합한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.fetchChannel.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-2', sid: 'site-1' },
            ],
        });

        await repository.refreshList({ sid: 'site-1', detail: true, limit: 100 } as any);

        expect(channelSocketDataSource.fetchChannel).toHaveBeenCalledWith(
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
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // Leaving marks the channel locally; a lagging server snapshot must not resurrect it.
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-left' });
        await repository.leaveChannel({ channelId: 'ch-left' } as any);
        channelLocalDataSource.cacheWriteMany.mockClear();

        channelSocketDataSource.fetchChannel.mockResolvedValue({
            list: [{ id: 'ch-left', sid: 'site-1' }, { sid: 'site-1' }, { id: 'ch-3', sid: 'site-1' }],
        });

        await repository.refreshList({ sid: 'site-1' } as any);

        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-3', sid: 'site-1' }],
            expect.anything()
        );
    });

    it('refreshList — 요청한 site의 목록이 응답에 없으면 그 site의 캐시를 지우지 않는다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // `channel.mine` answers for the site the socket session is on and ignores the payload's
        // sid, so asking about another site returns a list that shares no ids with it. Treating
        // that as "site-2 has no channels anymore" wiped the switched-to place's cache and left
        // the sidebar empty until a reload (.claude/20260804/DEBUG-14-20-13.md).
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        channelLocalDataSource.cacheReadList.mockResolvedValue({ list: [{ id: 'ch-9', sid: 'site-2' }] });

        await repository.refreshList({ sid: 'site-2' } as any);

        expect(channelLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('refreshList — 응답이 요청한 site의 것이면 사라진 채널을 정리한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-gone', sid: 'site-1' },
            ],
        });

        await repository.refreshList({ sid: 'site-1' } as any);

        expect(channelLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['ch-gone'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — 본인 나가기(userId 없음)는 채널을 로컬 캐시에서 제거한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — 멤버 추방(userId 있음)은 내 채널 캐시를 evict하지 않는다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // Owner kicking another member: I stay in the room, so the channel must remain cached
        // and must not be marked as left (a lagging snapshot must still resurrect it for me).
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1', userId: 'other-user' } as any);

        expect(channelLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        expect(channelSocketDataSource.leaveChannel).toHaveBeenCalledWith(
            { channelId: 'ch-1', userId: 'other-user' },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );

        // The kicked channel is NOT filtered out of a subsequent snapshot merge.
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        await repository.refreshList({ sid: 'site-1' } as any);
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-1', sid: 'site-1' }],
            expect.anything()
        );
    });

    it('refreshList — 빈 스냅샷이면 캐시를 건드리지 않는다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [] });

        await repository.refreshList({});

        expect(channelLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
    });

    it('getSelfChannel: 원격 조회 결과(나와의 채팅)를 로컬 캐시에 기록하고 반환한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel', sid: 'site-1' });

        await expect(repository.getSelfChannel({} as any)).resolves.toEqual({ id: 'self-channel', sid: 'site-1' });
        // The self channel must land in the cache so the channel list observers pick it up.
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            { id: 'self-channel', sid: 'site-1' },
            expect.anything()
        );
    });

    it('getUnreads: 로컬 캐시를 건드리지 않는 pass-through', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getUnreads.mockResolvedValue({ total: 3 });

        await expect(repository.getUnreads({} as any)).resolves.toEqual({ total: 3 });
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });
});
