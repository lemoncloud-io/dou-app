import { logger } from '@chatic/bridges';

import { ChannelRepository } from './ChannelRepository';

// The swallowed purge failure is only observable through the logger, and the real one routes to a
// sink that is not installed under jest — asserting on `console.warn` would pass or fail depending
// on sink wiring rather than on this repository's behavior.
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('ChannelRepository', () => {
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
            repository: new ChannelRepository(
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

    it('inviteChannel — optimistically writes the invited ids into memberIds before the round trip', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockResolvedValue({ id: 'ch-1', sid: 'site-1', memberIds: ['me'] });
        // Even when the server response omits the member list, the invited ids must not be lost (the same guard as leaveChannel).
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

    it('inviteChannel — restores the pre-invite channel record on failure', async () => {
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

    it('refreshList — merges the fetchChannel snapshot into the local cache', async () => {
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

    it('refreshList — excludes left channels and rows with no id from the merge', async () => {
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

    it('the leave guard is time-bounded — after it expires refreshList/syncChannels accept a rejoined channel again', async () => {
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

    it('leaveChannel — a successful self-leave empties the chat cache of that channel', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(chatLocalDataSource.cacheClearByChannelId).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — a failed leave leaves the chat cache untouched', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        // Messages are not restorable: the feed is windowed by joinedNo, so anything dropped in
        // error is gone for good. The purge therefore waits for the server to confirm the leave.
        channelSocketDataSource.leaveChannel.mockRejectedValue(new Error('nope'));

        await expect(repository.leaveChannel({ channelId: 'ch-1' } as any)).rejects.toThrow('nope');

        expect(chatLocalDataSource.cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('leaveChannel — kicking a member does not empty my chat cache', async () => {
        const { repository, channelSocketDataSource, chatLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1', userId: 'other-user' } as any);

        expect(chatLocalDataSource.cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('leaveChannel — the leave still succeeds when the chat cache cleanup fails', async () => {
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

    it('refreshList — does not clear the cache of a site when the response holds no list for the requested site', async () => {
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

    it('refreshList — prunes vanished channels when the response is for the requested site', async () => {
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

    it('leaveChannel — a self-leave (no userId) removes the channel from the local cache', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('leaveChannel — kicking a member (userId present) does not evict my channel cache', async () => {
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

    it('refreshList — leaves the cache untouched on an empty snapshot', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [] });

        await repository.refreshList({ sid: 'site-1' } as any);

        expect(channelLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
    });

    // ADR-0085 — the site is named by the caller, never taken off the ambient context. The provider
    // above sits on 'site-1', so a caller naming 'site-2' proves which of the two wins.
    it('refreshList refuses a query with no sid rather than falling back to the ambient one', async () => {
        const { repository, channelSocketDataSource } = createRepository();

        await expect(repository.refreshList({} as any)).rejects.toThrow(/query\.sid/);
        // It must give up BEFORE asking the server: an unattributed answer is what opens the prune
        // gate that would delete another site's cached channels.
        expect(channelSocketDataSource.fetchChannel).not.toHaveBeenCalled();
    });

    it('createChannel tags the optimistic row with the CALLER site, not the ambient one', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.createChannel.mockResolvedValue({ id: 'ch-new', sid: 'site-2' });

        await repository.createChannel({ name: 'new' } as any, 'site-2');

        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ sid: 'site-2' }),
            expect.anything()
        );
    });

    it('createChannel refuses to write an optimistic row it cannot attribute to a site', async () => {
        const { repository, channelLocalDataSource } = createRepository();

        await expect(repository.createChannel({ name: 'new' } as any, '')).rejects.toThrow(/siteId/);
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('getSelfChannel: writes the remote result (notes-to-self) to the local cache and returns it', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel', sid: 'site-1' });

        await expect(repository.getSelfChannel({} as any)).resolves.toEqual({ id: 'self-channel', sid: 'site-1' });
        // The self channel must land in the cache so the channel list observers pick it up.
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            { id: 'self-channel', sid: 'site-1' },
            expect.anything()
        );
    });

    it('getUnreads: a pass-through that does not touch the local cache', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getUnreads.mockResolvedValue({ total: 3 });

        await expect(repository.getUnreads({} as any)).resolves.toEqual({ total: 3 });
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });
});
