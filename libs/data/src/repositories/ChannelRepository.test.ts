import { logger } from '@chatic/bridges';

import { ChannelLocalDataSource } from '../local/data-sources/ChannelLocalDataSource';
import { ChatLocalDataSource } from '../local/data-sources/ChatLocalDataSource';
import { createPartitionedMemoryStorage } from '../local/data-sources/__mocks__/MemoryCacheStorage';
import { ChannelRepository } from './ChannelRepository';
import { DataContextHolder } from './types';

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
            startDm: jest.fn(),
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
            // No `sid`: the producer stopped seeding one (ADR-0085), so a repository that still needed
            // an ambient site would fail here rather than quietly borrow the fixture's.
            getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
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
            uid: 'me',
        });
        expect(channelLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
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
            { cid: 'cloud-a', uid: 'me' }
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            2,
            { id: 'ch-1', sid: 'site-1', memberIds: ['me', 'u-2', 'u-3'] },
            { cid: 'cloud-a', uid: 'me' }
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

        // The mapping context carries the site the CALLER named — that is what tags rows whose
        // response has no site of its own. The cache write below goes under the request context,
        // which has no sid at all (ADR-0085).
        expect(channelSocketDataSource.fetchChannel).toHaveBeenCalledWith(
            { sid: 'site-1', detail: true, limit: 100 },
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [
                { id: 'ch-1', sid: 'site-1' },
                { id: 'ch-2', sid: 'site-1' },
            ],
            { cid: 'cloud-a', uid: 'me' }
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
            uid: 'me',
        });
    });

    it('leaveChannel — a self-leave (no userId) removes the channel from the local cache', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
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
            { cid: 'cloud-a', uid: 'me' }
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

    // The room is stored like any other. It briefly had a write path of its own that blanked the
    // place field; the server assigns one and returns it on every read, so where a 1:1 may be
    // listed is decided when reading instead (`isInPlaceList`).
    it('startDm stores the room through the ordinary write', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'dm-1', sid: 'site-1', stereo: 'dm' });

        const result = await repository.startDm({ peerId: 'u2' } as any);

        expect(channelSocketDataSource.startDm).toHaveBeenCalledWith(
            { peerId: 'u2' },
            expect.objectContaining({ cid: 'cloud-a' })
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'dm-1' }),
            expect.anything()
        );
        expect(result.id).toBe('dm-1');
    });

    it('startDm takes no site — unlike createChannel it cannot be told one', async () => {
        const { repository, channelSocketDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'dm-1', sid: '' });

        await repository.startDm({ peerId: 'u2' } as any);

        // The contract carries one peer and nothing else; a site would have to come from the ambient
        // context, which is the failure this whole path exists to avoid.
        expect(channelSocketDataSource.startDm.mock.calls[0][0]).toEqual({ peerId: 'u2' });
    });

    it('createChannel refuses to write an optimistic row it cannot attribute to a site', async () => {
        const { repository, channelLocalDataSource } = createRepository();

        await expect(repository.createChannel({ name: 'new' } as any, '')).rejects.toThrow(/siteId/);
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('getSelfChannel: writes the remote result (notes-to-self) to the local cache and returns it', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel', sid: 'site-1' });

        await expect(repository.getSelfChannel({} as any, 'site-1')).resolves.toEqual({
            id: 'self-channel',
            sid: 'site-1',
        });
        // The response carries no site of its own, so the caller's is what reaches the mapper.
        expect(channelSocketDataSource.getSelfChannel).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ sid: 'site-1' })
        );
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

/**
 * The repository against real local data sources on partitioned storage, so an assertion is about
 * where a row ended up rather than what a mock was called with. Every case turns on an answer that
 * arrives after the context moved.
 */
describe('ChannelRepository — the scope an answer is written under', () => {
    const deferred = <T>() => {
        let resolve!: (value: T) => void;
        const promise = new Promise<T>(settle => (resolve = settle));
        return { promise, resolve };
    };

    const createScopedRepository = (initial: Record<string, string>) => {
        const context = new DataContextHolder(initial);
        const channels = createPartitionedMemoryStorage('channel');
        const socket = {
            fetchChannel: jest.fn(),
            syncChannel: jest.fn(),
            startDm: jest.fn(),
            getSelfChannel: jest.fn(),
        };
        const repository = new ChannelRepository(
            socket as any,
            new ChannelLocalDataSource(context, channels),
            new ChatLocalDataSource(context, createPartitionedMemoryStorage('chat')),
            context
        );
        const idsIn = async (cid: string, uid = 'me') =>
            (await channels.forScope({ cid, uid }).loadAll()).map(row => row.id).sort();
        return { context, repository, socket, idsIn, channels };
    };

    it('a sync answered after a switch lands in the cloud it was asked for and prunes nothing elsewhere', async () => {
        const { context, repository, socket, idsIn, channels } = createScopedRepository({
            cid: 'cloud-b',
            uid: 'me',
            socketCid: 'cloud-b',
        });
        await channels.forScope({ cid: 'cloud-b', uid: 'me' }).saveAll([
            { id: 'b-1', cid: 'cloud-b', sid: 's-b' },
            { id: 'b-2', cid: 'cloud-b', sid: 's-b' },
        ] as any);
        const remote = deferred<any>();
        socket.syncChannel.mockReturnValue(remote.promise);

        context.setContext({ cid: 'cloud-a', uid: 'me', socketCid: 'cloud-a' });
        const pending = repository.syncChannels(0);
        context.setContext({ cid: 'cloud-b', uid: 'me', socketCid: 'cloud-b' });
        remote.resolve({ list: [{ id: 'a-1', sid: 's-a', $: { sid: 's-a' } }], ids: ['a-1'], syncedAt: 123 });
        await pending;

        expect(await idsIn('cloud-a')).toEqual(['a-1']);
        // The stale prune reads the partition the answer describes; cloud B's own rows survive it.
        expect(await idsIn('cloud-b')).toEqual(['b-1', 'b-2']);
    });

    it('a refresh answered after an account switch stays with the account that asked', async () => {
        const { context, repository, socket, idsIn } = createScopedRepository({ cid: 'cloud-a', uid: 'me' });
        const remote = deferred<any>();
        socket.fetchChannel.mockReturnValue(remote.promise);

        const pending = repository.refreshList({ sid: 's-a' });
        context.setContext({ cid: 'cloud-a', uid: 'someone-else' });
        remote.resolve({ list: [{ id: 'a-1', sid: 's-a' }] });
        await pending;

        expect(await idsIn('cloud-a', 'me')).toEqual(['a-1']);
        expect(await idsIn('cloud-a', 'someone-else')).toEqual([]);
    });

    it('startDm caches an answer to a request sent before the switch window opened', async () => {
        const { context, repository, socket, idsIn } = createScopedRepository({
            cid: 'cloud-a',
            uid: 'me',
            socketCid: 'cloud-a',
        });
        const remote = deferred<any>();
        socket.startDm.mockReturnValue(remote.promise);

        const pending = repository.startDm({ peerId: 'u2' } as any);
        // The switch starts while the request is in flight: cid flips, the socket has not rebound.
        context.setContext({ cid: 'cloud-b', uid: 'me', socketCid: 'cloud-a' });
        remote.resolve({ id: 'dm-1', sid: 's-a' });
        await pending;

        expect(await idsIn('cloud-a')).toEqual(['dm-1']);
        expect(await idsIn('cloud-b')).toEqual([]);
    });

    it('startDm returns but does not cache an answer from a socket that served another cloud when asked', async () => {
        const { context, repository, socket, idsIn } = createScopedRepository({
            cid: 'cloud-b',
            uid: 'me',
            socketCid: 'cloud-a',
        });
        const remote = deferred<any>();
        socket.startDm.mockReturnValue(remote.promise);

        const pending = repository.startDm({ peerId: 'u2' } as any);
        // The socket rebinds before the answer arrives; the answer still came from cloud A.
        context.setContext({ cid: 'cloud-b', uid: 'me', socketCid: 'cloud-b' });
        remote.resolve({ id: 'dm-from-a', sid: 's-a' });

        await expect(pending).resolves.toMatchObject({ id: 'dm-from-a' });
        expect(await idsIn('cloud-b')).toEqual([]);
        expect(await idsIn('cloud-a')).toEqual([]);
    });

    it('getSelfChannel does not cache an answer from a socket that served another cloud when asked', async () => {
        const { context, repository, socket, idsIn } = createScopedRepository({
            cid: 'cloud-b',
            uid: 'me',
            socketCid: 'cloud-a',
        });
        const remote = deferred<any>();
        socket.getSelfChannel.mockReturnValue(remote.promise);

        const pending = repository.getSelfChannel({} as any, 's-b');
        context.setContext({ cid: 'cloud-b', uid: 'me', socketCid: 'cloud-b' });
        remote.resolve({ id: 'self-from-a' });

        await expect(pending).resolves.toMatchObject({ id: 'self-from-a' });
        expect(await idsIn('cloud-b')).toEqual([]);
    });
});
