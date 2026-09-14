import { logger } from '@chatic/bridges';

import { ChannelRepositoryV2 } from './ChannelRepositoryV2';

// The swallowed purge failure is only observable through the logger, and the real one routes to a
// sink that is not installed under jest — asserting on `console.warn` would pass or fail depending
// on sink wiring rather than on this repository's behavior.
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('ChannelRepositoryV2', () => {
    // `logger` is the one mock shared across tests — the collaborators are rebuilt by
    // `createRepository()` for each. Without this its calls accumulate, and any test that counts
    // entries reads the previous test's as its own.
    beforeEach(() => {
        jest.clearAllMocks();
    });

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
        const chatLocalDataSource = {
            cacheClearByChannelId: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new ChannelRepositoryV2(
                channelSocketDataSource as any,
                channelLocalDataSource as any,
                chatLocalDataSource as any,
                contextProvider
            ),
            channelSocketDataSource,
            channelLocalDataSource,
            chatLocalDataSource,
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

    it('나가기 가드는 시한부다 — 만료 후에는 재입장한 채널을 refreshList/syncChannels가 다시 받아들인다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // The guard covers ONE race (a snapshot issued before the leave answering after it). Held
        // forever it would also block a re-invite from ever reaching the cache — the room would stay
        // invisible for the rest of the session (ADR-0067).
        const now = Date.now();
        const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-left' });
        await repository.leaveChannel({ channelId: 'ch-left' } as any);
        channelLocalDataSource.cacheWriteMany.mockClear();

        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-left', sid: 'site-1' }] });
        channelSocketDataSource.syncChannel.mockResolvedValue({
            list: [{ id: 'ch-left', sid: 'site-1', $: { sid: 'site-1' } }],
            syncedAt: 1,
        });

        // Still inside the window: both ingestion paths drop it.
        await repository.refreshList({ sid: 'site-1' } as any);
        await repository.syncChannels(0);
        expect(channelLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();

        clock.mockReturnValue(now + 10_001);

        await repository.refreshList({ sid: 'site-1' } as any);
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-left', sid: 'site-1' }],
            expect.anything()
        );

        channelLocalDataSource.cacheWriteMany.mockClear();
        await repository.syncChannels(0);
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-left', sid: 'site-1', $: { sid: 'site-1' } }],
            expect.anything()
        );

        clock.mockRestore();
    });

    it('leaveChannel — 본인 나가기가 성공하면 그 채널의 chat 캐시를 비운다', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(chatLocalDataSource.cacheClearByChannelId).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — 나가기가 실패하면 chat 캐시는 건드리지 않는다', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        // Messages are not restorable: the feed is windowed by joinedNo, so anything dropped in
        // error is gone for good. The purge therefore waits for the server to confirm the leave.
        channelSocketDataSource.leaveChannel.mockRejectedValue(new Error('nope'));

        await expect(repository.leaveChannel({ channelId: 'ch-1' } as any)).rejects.toThrow('nope');

        expect(chatLocalDataSource.cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('leaveChannel — 멤버 추방은 내 chat 캐시를 비우지 않는다', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1', userId: 'other-user' } as any);

        expect(chatLocalDataSource.cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('leaveChannel — chat 캐시 정리가 실패해도 나가기는 성공으로 끝난다', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        // The leave already happened server-side; reporting it as failed would be the bigger lie.
        // Rows that outlive their room are covered by isInJoinWindow on every screen.
        (logger.warn as jest.Mock).mockClear();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });
        chatLocalDataSource.cacheClearByChannelId.mockRejectedValue(new Error('bridge timeout'));

        await expect(repository.leaveChannel({ channelId: 'ch-1' } as any)).resolves.toEqual({ id: 'ch-1' });

        // Swallowed, but not silently — a purge that never happened has to be findable in the logs.
        expect(logger.warn).toHaveBeenCalled();
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

    it('syncChannels — ids에 없는 행이 있어도 지우지 않고 기록만 한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // A row the answer does not mention is not evidence that I left the room, and the cost of
        // being wrong is one-way: the cursor advances past what was deleted, so a delta never
        // re-sends it. On relay only the notes-to-self room survives such a deletion, because
        // `channel.get-self` puts that one back and nothing puts the rest back.
        channelSocketDataSource.syncChannel.mockResolvedValue({
            list: [],
            ids: ['ch-self'],
            syncedAt: 300,
        });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [
                { id: 'ch-self', sid: 'site-1' },
                { id: 'ch-dm', sid: 'site-1' },
            ],
        });

        await repository.syncChannels(0);

        expect(channelLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            'CACHE',
            expect.stringContaining('does not list rows the cache holds'),
            expect.objectContaining({
                data: expect.objectContaining({ missingCount: 1, missingIds: ['ch-dm'] }),
            })
        );
    });

    it('syncChannels — 같은 불일치는 한 번만 기록한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // The poll runs every 60s. A standing disagreement written on each one would evict the
        // entries that explain it.
        channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-1'], syncedAt: 300 });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-missing', sid: 'site-1' },
            ],
        });

        await repository.syncChannels(0);
        await repository.syncChannels(300);

        const gapEntries = (logger.warn as jest.Mock).mock.calls.filter(([, message]) =>
            `${message}`.includes('does not list rows the cache holds')
        );
        expect(gapEntries).toHaveLength(1);
    });

    it('syncChannels — 불일치가 사라졌다 다시 생기면 다시 기록한다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-1'], syncedAt: 300 });
        channelLocalDataSource.cacheReadList.mockResolvedValueOnce({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-missing', sid: 'site-1' },
            ],
        });
        await repository.syncChannels(0);

        // Gap closed — the memo clears.
        channelLocalDataSource.cacheReadList.mockResolvedValueOnce({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        await repository.syncChannels(300);

        // Same gap returns; it is news again.
        channelLocalDataSource.cacheReadList.mockResolvedValueOnce({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-missing', sid: 'site-1' },
            ],
        });
        await repository.syncChannels(600);

        const gapEntries = (logger.warn as jest.Mock).mock.calls.filter(([, message]) =>
            `${message}`.includes('does not list rows the cache holds')
        );
        expect(gapEntries).toHaveLength(2);
    });

    it('syncChannels — 비교가 실패해도 동기화는 커서를 들고 끝난다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // The comparison is diagnostic. Throwing would fail the sync, hold the cursor back and
        // freeze the list — worse than a missing entry.
        channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-1'], syncedAt: 300 });
        channelLocalDataSource.cacheReadList.mockRejectedValue(new Error('boom'));

        await expect(repository.syncChannels(0)).resolves.toEqual({ syncedAt: 300 });
    });

    it('restoreList — 스냅샷을 캐시에 쓰되 무엇도 지우지 않는다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // The repair call. channel.mine answers for the socket session's site while the relay cache
        // is read across every site, so a prune from here could take rooms the response never spoke
        // for — writing is safe in a way deleting is not.
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-1', sid: 'site-1' }] });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-other', sid: 'site-2' },
            ],
        });

        await repository.restoreList({});

        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-1', sid: 'site-1' }],
            expect.anything()
        );
        expect(channelLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
    });

    it('restoreList — 빈 스냅샷이면 캐시를 건드리지 않는다', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [] });

        await repository.restoreList({});

        expect(channelLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        expect(channelLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
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
