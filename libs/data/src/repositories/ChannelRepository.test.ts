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
            getChannel: jest.fn(),
            startDm: jest.fn(),
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
        await repository.cacheDelete('ch-1');
        await repository.cacheClear();

        // Helper methods should stay thin wrappers so hooks can rely on a consistent context-bound API.
        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledWith('ch-1', { cid: 'cloud-a', uid: 'me' });
        expect(channelLocalDataSource.cacheReadList).toHaveBeenCalledWith(
            { sid: 'site-1' },
            {
                cid: 'cloud-a',
                uid: 'me',
            }
        );
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

    it('syncChannels keeps the Self Channel, which has no place, and still drops other place-less rows', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        // The relay sends a new user's Self Channel with an empty `$`: it belongs to the account, not
        // to a place. Dropping it with the other place-less rows left Home with no channel at all.
        channelSocketDataSource.syncChannel.mockResolvedValue({
            list: [
                { id: 'U:1001', stereo: 'self', $: {} },
                { id: 'ch-orphan', stereo: 'public', $: {} },
            ],
            syncedAt: 1,
        });

        await repository.syncChannels(0);

        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'U:1001', stereo: 'self', $: {} }],
            expect.anything()
        );
    });

    // A cloud 1:1's place comes from its own field or its id, never the reader's; one that names
    // none is kept too, for a desktop cloud with no place to list.
    it('syncChannels keeps a cloud 1:1 whose row carries no place field', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.syncChannel.mockResolvedValue({
            list: [
                { id: 'S1@me@u2', cid: 'cloud-a', stereo: 'dm', sid: 'S1', $: {} },
                { id: 'me@u3', cid: 'cloud-a', stereo: 'dm', sid: '', $: {} },
                { id: 'relay-dm', cid: 'default', stereo: 'dm', $: {} },
            ],
            syncedAt: 1,
        });

        await repository.syncChannels(0);

        expect(channelLocalDataSource.cacheWriteMany.mock.calls[0][0].map((row: { id: string }) => row.id)).toEqual([
            'S1@me@u2',
            'me@u3',
        ]);
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
        // the sidebar empty until a reload.
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

    it('evictLeftChannels — each channel the server took me out of loses its row and its messages, under the scope given', async () => {
        const { repository, channelLocalDataSource, chatLocalDataSource, channelSocketDataSource } = createRepository();
        // The scope the place leave was asked in — not the repository's live one.
        const asked = { cid: 'cloud-x', uid: 'me-x' };

        await repository.evictLeftChannels(['ch-1', 'ch-2', 'ch-1'], asked);

        expect(channelLocalDataSource.cacheDelete.mock.calls).toEqual([
            ['ch-1', asked],
            ['ch-2', asked],
        ]);
        expect(chatLocalDataSource.cacheClearByChannelId.mock.calls).toEqual([
            ['ch-1', asked],
            ['ch-2', asked],
        ]);
        // No round trip of its own: the server has already answered.
        expect(channelSocketDataSource.leaveChannel).not.toHaveBeenCalled();
    });

    it('evictLeftChannels — a snapshot that still lists an evicted channel does not bring it back', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();

        await repository.evictLeftChannels(['ch-left'], { cid: 'cloud-a', uid: 'me' });
        channelSocketDataSource.fetchChannel.mockResolvedValue({
            list: [
                { id: 'ch-left', sid: 'site-1' },
                { id: 'ch-kept', sid: 'site-1' },
            ],
        });
        await repository.refreshList({ sid: 'site-1' } as any);

        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [{ id: 'ch-kept', sid: 'site-1' }],
            expect.anything()
        );
    });

    it('evictLeftChannels — a chat cache that cannot be cleared does not stop the next channel', async () => {
        const { repository, channelLocalDataSource, chatLocalDataSource } = createRepository();
        chatLocalDataSource.cacheClearByChannelId.mockRejectedValueOnce(new Error('bridge timeout'));

        await expect(repository.evictLeftChannels(['ch-1', 'ch-2'], { cid: 'cloud-a', uid: 'me' })).resolves.toBe(
            undefined
        );

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-2', expect.anything());
        expect(chatLocalDataSource.cacheClearByChannelId).toHaveBeenCalledWith('ch-2', expect.anything());
    });

    it('evictLeftChannels — a row that cannot be removed is logged and the next channel is still cleared', async () => {
        const { repository, channelLocalDataSource, chatLocalDataSource } = createRepository();
        (logger.warn as jest.Mock).mockClear();
        channelLocalDataSource.cacheDelete.mockRejectedValueOnce(new Error('IndexedDB is closed'));

        await expect(repository.evictLeftChannels(['ch-1', 'ch-2'], { cid: 'cloud-a', uid: 'me' })).resolves.toBe(
            undefined
        );

        expect(channelLocalDataSource.cacheDelete).toHaveBeenCalledWith('ch-2', expect.anything());
        expect(chatLocalDataSource.cacheClearByChannelId).toHaveBeenCalledWith('ch-2', expect.anything());
        expect(logger.warn).toHaveBeenCalled();
    });

    it('dropMemberFromChannels — a roster that cannot be written is logged and the next channel is still corrected', async () => {
        const { repository, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockImplementation(async (id: string) => ({ id, memberIds: ['me', 'u-2'] }));
        channelLocalDataSource.cacheWrite.mockRejectedValueOnce(new Error('IndexedDB is closed'));

        await expect(
            repository.dropMemberFromChannels(['ch-1', 'ch-2'], 'u-2', { cid: 'cloud-a', uid: 'me' })
        ).resolves.toBe(undefined);

        expect(channelLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            { id: 'ch-2', memberIds: ['me'] },
            expect.anything()
        );
    });

    it('dropMemberFromChannels — takes the member out of cached rosters and skips channels this device does not hold', async () => {
        const { repository, channelLocalDataSource, chatLocalDataSource } = createRepository();
        const asked = { cid: 'cloud-x', uid: 'me-x' };
        channelLocalDataSource.cacheRead.mockImplementation(async (id: string) =>
            id === 'ch-1' ? { id: 'ch-1', sid: 'site-1', memberIds: ['me', 'u-2', 'u-3'] } : null
        );

        await repository.dropMemberFromChannels(['ch-1', 'ch-unknown'], 'u-2', asked);

        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledWith('ch-unknown', asked);
        expect(channelLocalDataSource.cacheWrite.mock.calls).toEqual([
            [{ id: 'ch-1', memberIds: ['me', 'u-3'] }, asked],
        ]);
        // I stay in those rooms: nothing of mine is evicted.
        expect(channelLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        expect(chatLocalDataSource.cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('leaveChannel — a kick still takes the member out when the answer carries no roster', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockResolvedValue({ id: 'ch-1', memberIds: ['me', 'u-2'] });
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });

        await repository.leaveChannel({ channelId: 'ch-1', userId: 'u-2' } as any);

        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            { id: 'ch-1', memberIds: ['me'] },
            { cid: 'cloud-a', uid: 'me' }
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

    it('startDm stores the room under the place the server sent', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'dm-1', sid: 'site-1', stereo: 'dm' });

        const result = await repository.startDm({ peerId: 'u2' } as any);

        expect(channelSocketDataSource.startDm).toHaveBeenCalledWith(
            { peerId: 'u2' },
            expect.objectContaining({ cid: 'cloud-a' })
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'dm-1', sid: 'site-1' }),
            expect.anything()
        );
        expect(result.id).toBe('dm-1');
    });

    // The answer for a room the call has just created carries no site field; a place-keyed id names
    // the place the server filed it under.
    it('startDm caches a new room under the place its id names', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'site-7@me@u2', sid: '' });

        const result = await repository.startDm({ peerId: 'u2' } as any);

        expect(result).toMatchObject({ id: 'site-7@me@u2', sid: 'site-7', stereo: 'dm' });
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'site-7@me@u2', sid: 'site-7' }),
            expect.anything()
        );
    });

    // The ambient place is the reader's, not the room's: it is never handed to the mapper.
    it('startDm maps the answer without the ambient place', async () => {
        const { repository, channelSocketDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'site-7@me@u2', sid: '' });

        await repository.startDm({ peerId: 'u2' } as any);

        expect(channelSocketDataSource.startDm.mock.calls[0][1]).toEqual(expect.objectContaining({ sid: undefined }));
    });

    // A room that names no place — no field, and a pair key from before places keyed 1:1s — is not
    // cached: the local write needs a place, and the next sync brings the row with one.
    it('startDm returns a room that names no place and leaves its row to the next sync', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.startDm.mockResolvedValue({ id: 'me@u2', sid: '', stereo: 'dm' });

        await expect(repository.startDm({ peerId: 'u2' } as any)).resolves.toEqual(
            expect.objectContaining({ id: 'me@u2', sid: '' })
        );
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
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

    it('refreshOne: pulls one channel snapshot and writes it to the local cache', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.getChannel.mockResolvedValue({ id: 'ch-1', sid: 'site-1' });

        await expect(repository.refreshOne('ch-1', 'site-1')).resolves.toEqual({
            id: 'ch-1',
            sid: 'site-1',
        });
        // The response carries no site of its own, so the caller's site tags the mapping.
        expect(channelSocketDataSource.getChannel).toHaveBeenCalledWith(
            { id: 'ch-1' },
            expect.objectContaining({ sid: 'site-1' })
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            { id: 'ch-1', sid: 'site-1' },
            expect.anything()
        );
    });

    it('refreshOne: rejects a blank channelId or siteId without touching the socket', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();

        await expect(repository.refreshOne('', 'site-1')).rejects.toThrow(/channelId/);
        await expect(repository.refreshOne('ch-1', '')).rejects.toThrow(/siteId/);
        expect(channelSocketDataSource.getChannel).not.toHaveBeenCalled();
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('refreshOne: leaves a just-left channel out of the cache but still returns it', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelSocketDataSource.leaveChannel.mockResolvedValue({ id: 'ch-1' });
        channelSocketDataSource.getChannel.mockResolvedValue({ id: 'ch-1', sid: 'site-1' });
        await repository.leaveChannel({ channelId: 'ch-1' } as any);

        await expect(repository.refreshOne('ch-1', 'site-1')).resolves.toMatchObject({ id: 'ch-1' });
        // A stale push must not resurrect the row the leave just removed.
        expect(channelLocalDataSource.cacheWrite).not.toHaveBeenCalled();
    });

    it('refreshOneInCloud: tags the answer with the cached row place, not the caller belief', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockResolvedValue({ id: 'ch-1', sid: 'site-b' });
        channelSocketDataSource.getChannel.mockResolvedValue({ id: 'ch-1', sid: 'site-b' });

        await expect(repository.refreshOneInCloud('ch-1', 'site-a')).resolves.toMatchObject({ id: 'ch-1' });
        expect(channelSocketDataSource.getChannel).toHaveBeenCalledWith(
            { id: 'ch-1' },
            expect.objectContaining({ sid: 'site-b' })
        );
    });

    it('refreshOneInCloud: falls back to the given site for a channel never listed yet', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
        channelLocalDataSource.cacheRead.mockResolvedValue(null);
        channelSocketDataSource.getChannel.mockResolvedValue({ id: 'ch-9', sid: 'site-a' });

        await expect(repository.refreshOneInCloud('ch-9', 'site-a')).resolves.toMatchObject({ id: 'ch-9' });
        expect(channelSocketDataSource.getChannel).toHaveBeenCalledWith(
            { id: 'ch-9' },
            expect.objectContaining({ sid: 'site-a' })
        );
    });

    it('refreshOneInCloud: rejects a blank channelId without touching the socket or cache', async () => {
        const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();

        await expect(repository.refreshOneInCloud('', 'site-a')).rejects.toThrow(/channelId/);
        expect(channelSocketDataSource.getChannel).not.toHaveBeenCalled();
        expect(channelLocalDataSource.cacheRead).not.toHaveBeenCalled();
    });

    describe('a list fetched before a create or delete, answering after it', () => {
        // `channel.mine` and `channel.sync` describe the server as it was when they were asked. One
        // asked just before a mutation and answering just after it is out of date about that one room.

        it('deleteChannel — a snapshot that still lists the deleted channel does not bring it back', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            channelSocketDataSource.deleteChannel.mockResolvedValue({ id: 'ch-gone' });
            await repository.deleteChannel({ channelId: 'ch-gone' } as any);

            channelSocketDataSource.fetchChannel.mockResolvedValue({
                list: [
                    { id: 'ch-gone', sid: 'site-1' },
                    { id: 'ch-kept', sid: 'site-1' },
                ],
            });
            channelSocketDataSource.syncChannel.mockResolvedValue({
                list: [{ id: 'ch-gone', sid: 'site-1', $: { sid: 'site-1' } }],
                syncedAt: 1,
            });
            await repository.refreshList({ sid: 'site-1' } as any);
            await repository.syncChannels(0);

            expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledTimes(1);
            expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
                [{ id: 'ch-kept', sid: 'site-1' }],
                expect.anything()
            );
        });

        it('deleteChannel — a failed delete puts the row back and lets the next snapshot carry it', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            const existing = { id: 'ch-1', sid: 'site-1' };
            channelLocalDataSource.cacheRead.mockResolvedValue(existing);
            channelSocketDataSource.deleteChannel.mockRejectedValue(new Error('denied'));

            await expect(repository.deleteChannel({ channelId: 'ch-1' } as any)).rejects.toThrow('denied');
            expect(channelLocalDataSource.cacheWrite).toHaveBeenCalledWith(existing, expect.anything());

            channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [existing] });
            await repository.refreshList({ sid: 'site-1' } as any);
            expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([existing], expect.anything());
        });

        it('createChannel — a snapshot that does not list the new channel yet does not prune it', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            channelSocketDataSource.createChannel.mockResolvedValue({ id: 'ch-new', sid: 'site-1' });
            await repository.createChannel({ name: 'new' } as any, 'site-1');

            channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [{ id: 'ch-old', sid: 'site-1' }] });
            channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-old'], syncedAt: 1 });
            channelLocalDataSource.cacheReadList.mockResolvedValue({
                list: [
                    { id: 'ch-old', sid: 'site-1' },
                    { id: 'ch-new', sid: 'site-1' },
                    { id: 'ch-gone', sid: 'site-1' },
                ],
            });
            await repository.refreshList({ sid: 'site-1' } as any);
            await expect(repository.syncChannels(0)).resolves.toEqual({ syncedAt: 1, removedCount: 1 });

            expect(channelLocalDataSource.cacheDeleteMany.mock.calls).toEqual([
                [['ch-gone'], expect.anything()],
                [['ch-gone'], expect.anything()],
            ]);
        });

        it('startDm — a snapshot that does not list the new 1:1 yet does not prune it', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            channelSocketDataSource.startDm.mockResolvedValue({ id: 'site-1@me@u2', sid: 'site-1', stereo: 'dm' });
            await repository.startDm({ peerId: 'u2' } as any);

            channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-old'], syncedAt: 1 });
            channelLocalDataSource.cacheReadList.mockResolvedValue({
                list: [
                    { id: 'ch-old', sid: 'site-1' },
                    { id: 'site-1@me@u2', sid: 'site-1' },
                ],
            });
            await repository.syncChannels(0);

            expect(channelLocalDataSource.cacheDeleteMany).not.toHaveBeenCalled();
        });

        it('a new channel is spared only for that window — a later snapshot without it prunes it', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            const now = Date.now();
            const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
            channelSocketDataSource.createChannel.mockResolvedValue({ id: 'ch-new', sid: 'site-1' });
            await repository.createChannel({ name: 'new' } as any, 'site-1');

            channelSocketDataSource.syncChannel.mockResolvedValue({ list: [], ids: ['ch-old'], syncedAt: 1 });
            channelLocalDataSource.cacheReadList.mockResolvedValue({
                list: [
                    { id: 'ch-old', sid: 'site-1' },
                    { id: 'ch-new', sid: 'site-1' },
                ],
            });
            try {
                clock.mockReturnValue(now + 10_001);
                await repository.syncChannels(0);

                expect(channelLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['ch-new'], expect.anything());
            } finally {
                clock.mockRestore();
            }
        });

        it('startDm — re-opening a 1:1 left moments ago lets the next snapshot write it again', async () => {
            const { repository, channelSocketDataSource, channelLocalDataSource } = createRepository();
            const room = { id: 'site-1@me@u2', sid: 'site-1', stereo: 'dm' };
            channelSocketDataSource.leaveChannel.mockResolvedValue({ id: room.id });
            await repository.leaveChannel({ channelId: room.id } as any);
            channelSocketDataSource.startDm.mockResolvedValue(room);
            await repository.startDm({ peerId: 'u2' } as any);

            channelSocketDataSource.fetchChannel.mockResolvedValue({ list: [room] });
            await repository.refreshList({ sid: 'site-1' } as any);

            expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([room], expect.anything());
        });
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

    // A place switch moves the context before the server answers. The room stays in the place the
    // server filed it under, which its id names, and not the one the context moved to.
    it('startDm files a room answered during a place switch under the place its id names', async () => {
        const { context, repository, socket, channels } = createScopedRepository({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
            socketCid: 'cloud-a',
        });
        const remote = deferred<any>();
        socket.startDm.mockReturnValue(remote.promise);

        const pending = repository.startDm({ peerId: 'u2' } as any);
        context.setContext({ cid: 'cloud-a', sid: 'site-2', uid: 'me', socketCid: 'cloud-a' });
        remote.resolve({ id: 'site-1@me@u2', sid: '', stereo: 'dm', cid: 'cloud-a' });
        await pending;

        const [row] = await channels.forScope({ cid: 'cloud-a', uid: 'me' }).loadAll();
        expect(row).toMatchObject({ id: 'site-1@me@u2', sid: 'site-1' });
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
