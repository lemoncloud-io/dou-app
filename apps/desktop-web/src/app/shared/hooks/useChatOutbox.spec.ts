import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import { logger } from '@chatic/bridges';
import type { DataRepositories, DomainChat } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

const clouds = vi.hoisted(() => ({
    uids: {} as Record<string, string | null>,
    verified: [] as readonly string[],
    graphs: {} as Record<string, unknown>,
    sendInCloud: vi.fn(),
}));

vi.mock('@chatic/runtime', async () => {
    const uidOf = (cid: string) => clouds.uids[cid] ?? null;
    return (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        data: {
            getCloudRepositories: (cid: string) => clouds.graphs[cid],
            sendChatInCloud: (cid: string, payload: unknown) => clouds.sendInCloud(cid, payload),
        },
        session: { useUidInCloud: uidOf, getUidInCloud: uidOf },
        connection: { useVerifiedClouds: () => clouds.verified },
    });
});

import {
    createCloudOutbox,
    createLandingBatch,
    getChatOutbox,
    matchLandedRow,
    selectResendableRows,
    toSendPayload,
    useChatOutbox,
} from './useChatOutbox';

const MY_UID = 'u1';
const NOW = Date.now();

const chat = (over: Partial<DomainChat>): DomainChat =>
    ({
        id: 'row-1',
        channelId: 'ch-1',
        content: 'hello',
        chatNo: 0,
        ownerId: MY_UID,
        isFailed: false,
        isPending: false,
        createdAt: NOW,
        createdAtMs: NOW,
        ...over,
    }) as DomainChat;

describe('selectResendableRows', () => {
    it('keeps only my failed rows, oldest first', () => {
        const rows = [
            chat({ id: 'b', isFailed: true, createdAtMs: NOW + 200 }),
            chat({ id: 'a', isFailed: true, createdAtMs: NOW + 100 }),
            chat({ id: 'pending', isPending: true, isFailed: false }),
            chat({ id: 'theirs', isFailed: true, ownerId: 'someone-else' }),
            chat({ id: 'blank', isFailed: true, content: '' }),
        ];

        expect(selectResendableRows(rows, MY_UID).map(row => row.id)).toEqual(['a', 'b']);
    });

    it('returns nothing when the cache holds no failed rows', () => {
        expect(selectResendableRows([chat({ id: 'sent', chatNo: 4 })], MY_UID)).toEqual([]);
    });
});

describe('toSendPayload', () => {
    it('rebuilds a bare parent chatNo into the full <channelId>:<chatNo> id', () => {
        expect(toSendPayload(chat({ parentId: '7' })).parentId).toBe('ch-1:7');
    });

    it('leaves an already-full parent id alone and omits an absent one', () => {
        expect(toSendPayload(chat({ parentId: 'ch-1:7' })).parentId).toBe('ch-1:7');
        expect(toSendPayload(chat({})).parentId).toBeUndefined();
    });

    it('puts back the members the message called', () => {
        expect(toSendPayload(chat({ mention$: { userIds: ['u-ada', 'u-bo'] } })).mention).toEqual({
            userIds: ['u-ada', 'u-bo'],
        });
    });

    it.each([true, 1] as const)('sends everyone as true when the row holds %j', all => {
        expect(toSendPayload(chat({ mention$: { all } })).mention).toEqual({ all: true });
    });

    it.each([
        ['no record', {}],
        ['an empty record', { mention$: {} }],
    ])('sends no mention key for a row with %s', (_name, over) => {
        expect(toSendPayload(chat(over))).not.toHaveProperty('mention');
    });
});

const query = (over: Partial<Parameters<typeof matchLandedRow>[1]> = {}) => ({
    channelId: 'ch-1',
    content: 'hello',
    myUid: MY_UID,
    sentAt: NOW,
    ...over,
});

describe('matchLandedRow', () => {
    it('matches a server-persisted twin of the queued message', () => {
        const landed = chat({ id: 'ch-1:7', chatNo: 7 });
        expect(matchLandedRow([landed], query(), new Set())?.id).toBe('ch-1:7');
    });

    it('never matches the entry own failed row (chatNo 0)', () => {
        const failed = chat({ id: 'row-1', chatNo: 0, isFailed: true });
        expect(matchLandedRow([failed], query(), new Set())).toBeNull();
    });

    it('ignores other channels, other authors, other content and out-of-window history', () => {
        const rows = [
            chat({ id: 'x1', chatNo: 7, channelId: 'ch-2' }),
            chat({ id: 'x2', chatNo: 7, ownerId: 'someone-else' }),
            chat({ id: 'x3', chatNo: 7, content: 'different' }),
            chat({ id: 'x4', chatNo: 7, createdAtMs: NOW - 60 * 60_000 }),
        ];
        expect(matchLandedRow(rows, query(), new Set())).toBeNull();
    });

    it('skips a row an earlier entry already claimed', () => {
        const landed = chat({ id: 'ch-1:7', chatNo: 7 });
        expect(matchLandedRow([landed], query(), new Set(['ch-1:7']))).toBeNull();
    });

    it('still matches a twin from a long outage — the window tracks the SEND time, not the reconnect', () => {
        const sentAt = NOW - 100 * 60_000;
        const landed = chat({ id: 'ch-1:7', chatNo: 7, createdAtMs: sentAt + 1_000 });
        expect(matchLandedRow([landed], query({ sentAt }), new Set())?.id).toBe('ch-1:7');
    });
});

describe('createLandingBatch', () => {
    const entry = (over: Partial<runtime.data.OutboxEntry> = {}): runtime.data.OutboxEntry => ({
        id: 'row-1',
        cid: 'cloud-a',
        channelId: 'ch-1',
        payload: { channelId: 'ch-1', content: 'hello' },
        enqueuedAt: NOW,
        ...over,
    });

    it('claims only on commit, so a second identical entry can still match before then', () => {
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        expect(batch.match(rows, entry({ id: 'a' }), MY_UID)?.id).toBe('ch-1:7');
        batch.commit('a');
        expect(batch.match(rows, entry({ id: 'b' }), MY_UID)).toBeNull();
    });

    it('leaves NO orphaned claim when a matched entry is retired without committing', () => {
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        expect(batch.match(rows, entry({ id: 'a' }), MY_UID)?.id).toBe('ch-1:7');
        expect(batch.match(rows, entry({ id: 'b' }), MY_UID)?.id).toBe('ch-1:7');
    });

    it('keeps claims across sweeps — a later drain cannot re-consume a committed row', () => {
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        batch.match(rows, entry({ id: 'a' }), MY_UID);
        batch.commit('a');

        expect(batch.match(rows, entry({ id: 'a2' }), MY_UID)).toBeNull();
    });

    it('uses the recorded send time, so a reconnect hours later still matches', () => {
        const sentAt = NOW - 100 * 60_000;
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, createdAtMs: sentAt + 1_000 })];

        expect(createLandingBatch().match(rows, entry({ id: 'a' }), MY_UID)).toBeNull();

        const recorded = createLandingBatch();
        recorded.record('a', sentAt);
        expect(recorded.match(rows, entry({ id: 'a' }), MY_UID)?.id).toBe('ch-1:7');
    });

    it('commit() on an entry that never matched is a no-op', () => {
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        batch.commit('never-matched');
        expect(batch.match(rows, entry({ id: 'a' }), MY_UID)?.id).toBe('ch-1:7');
    });
});

describe('outbox + landing probe (the desktop wiring contract)', () => {
    const harness = (rows: DomainChat[], batch = createLandingBatch()) => {
        const send = vi.fn().mockResolvedValue(undefined);
        const discard = vi.fn().mockImplementation(async (entry: runtime.data.OutboxEntry) => {
            batch.commit(entry.id);
        });
        const outbox = runtime.data.createChatOutbox({
            send,
            discard,
            hasLanded: async entry => !!batch.match(rows, entry, MY_UID),
        });
        return { outbox, send, discard, batch };
    };

    const enqueueTwoIdentical = (outbox: ReturnType<typeof harness>['outbox']) => {
        outbox.enqueue({ id: 'a', cid: 'cloud-a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        outbox.enqueue({ id: 'b', cid: 'cloud-a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
    };

    it('sends the second of two identical messages when only ONE of them landed', async () => {
        const { outbox, send, discard } = harness([chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })]);

        outbox.start();
        enqueueTwoIdentical(outbox);
        outbox.setReady('cloud-a', true);
        await outbox.flush();

        expect(discard).toHaveBeenCalledTimes(1);
        expect(discard.mock.calls[0][0].id).toBe('a');
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].id).toBe('b');
    });

    it('discards both when both actually landed', async () => {
        const rows = [
            chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' }),
            chat({ id: 'ch-1:8', chatNo: 8, content: 'ok' }),
        ];
        const { outbox, send, discard } = harness(rows);

        outbox.start();
        enqueueTwoIdentical(outbox);
        outbox.setReady('cloud-a', true);
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(discard).toHaveBeenCalledTimes(2);
    });

    it('holds a committed claim across sweeps, so the next sweep sends instead of swallowing', async () => {
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })];

        const first = harness(rows);
        first.outbox.start();
        first.outbox.enqueue({
            id: 'a',
            cid: 'cloud-a',
            channelId: 'ch-1',
            payload: { channelId: 'ch-1', content: 'ok' },
        });
        first.outbox.setReady('cloud-a', true);
        await first.outbox.flush();
        expect(first.discard).toHaveBeenCalledTimes(1);

        const second = harness(rows, first.batch);
        second.outbox.start();
        second.outbox.enqueue({
            id: 'a2',
            cid: 'cloud-a',
            channelId: 'ch-1',
            payload: { channelId: 'ch-1', content: 'ok' },
        });
        second.outbox.setReady('cloud-a', true);
        await second.outbox.flush();

        expect(second.discard).not.toHaveBeenCalled();
        expect(second.send).toHaveBeenCalledTimes(1);
    });

    it('a failed discard leaves the row unclaimed, so the next sweep can still match it', async () => {
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })];
        const batch = createLandingBatch();
        const outbox = runtime.data.createChatOutbox({
            send: vi.fn().mockResolvedValue(undefined),
            discard: vi.fn().mockRejectedValue(new Error('cache delete failed')),
            hasLanded: async entry => !!batch.match(rows, entry, MY_UID),
        });

        outbox.start();
        outbox.enqueue({ id: 'a', cid: 'cloud-a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        outbox.setReady('cloud-a', true);
        await outbox.flush();

        const retry = harness(rows, batch);
        retry.outbox.start();
        retry.outbox.enqueue({
            id: 'a',
            cid: 'cloud-a',
            channelId: 'ch-1',
            payload: { channelId: 'ch-1', content: 'ok' },
        });
        retry.outbox.setReady('cloud-a', true);
        await retry.outbox.flush();

        expect(retry.discard).toHaveBeenCalledTimes(1);
        expect(retry.send).not.toHaveBeenCalled();
    });
});

const fakeCloud = ({ unsent = [] as DomainChat[], landed = [] as DomainChat[] } = {}) => {
    const cacheDelete = vi.fn().mockResolvedValue(undefined);
    const channelIds = [...new Set([...unsent, ...landed].map(row => row.channelId))];
    const graph = {
        channel: { cacheReadList: vi.fn(async () => ({ list: channelIds.map(id => ({ id })) })) },
        chat: {
            cacheReadList: vi.fn(async (query: { channelId: string; cursorNo?: number }) => ({
                list: (query.cursorNo === 1 ? unsent : landed).filter(row => row.channelId === query.channelId),
            })),
            cacheDelete,
        },
    } as unknown as Pick<DataRepositories, 'chat' | 'channel'>;
    return { graph, cacheDelete };
};

describe('createCloudOutbox', () => {
    const setup = (
        graphs: Record<string, Pick<DataRepositories, 'chat' | 'channel'>>,
        uids: Record<string, string>
    ) => {
        const sendInCloud = vi.fn().mockResolvedValue(undefined);
        const machine = createCloudOutbox({
            repositoriesOf: cid => graphs[cid],
            sendInCloud,
            uidOf: cid => uids[cid] ?? null,
        });
        machine.outbox.start();
        return { ...machine, sendInCloud };
    };

    it('queues a swept row under the cloud it was read from', async () => {
        const b = fakeCloud({ unsent: [chat({ id: 'row-b', cid: 'cloud-b', ownerId: 'uid-b', isFailed: true })] });
        const { outbox, sweep } = setup({ 'cloud-b': b.graph }, { 'cloud-b': 'uid-b' });

        await sweep('cloud-b');

        expect(outbox.pending('cloud-b').map(entry => [entry.id, entry.cid])).toEqual([['row-b', 'cloud-b']]);
        expect(outbox.pending('cloud-a')).toEqual([]);
    });

    it('judges "mine" by the uid in that cloud, not by another cloud\'s', async () => {
        const b = fakeCloud({
            unsent: [
                chat({ id: 'mine', ownerId: 'uid-b', isFailed: true }),
                chat({ id: 'other-cloud-uid', ownerId: 'uid-a', isFailed: true }),
            ],
        });
        const { outbox, sweep } = setup({ 'cloud-b': b.graph }, { 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' });

        await sweep('cloud-b');

        expect(outbox.pending().map(entry => entry.id)).toEqual(['mine']);
    });

    it('does not sweep a cloud the account has no uid in', async () => {
        const b = fakeCloud({ unsent: [chat({ id: 'row-b', ownerId: 'uid-b', isFailed: true })] });
        const { outbox, sweep } = setup({ 'cloud-b': b.graph }, {});

        await sweep('cloud-b');

        expect(outbox.pending()).toEqual([]);
    });

    it('re-sweeping a cloud mid-drain adds nothing, while another cloud still sweeps', async () => {
        const a = fakeCloud({ unsent: [chat({ id: 'row-a', ownerId: 'uid-a', isFailed: true })] });
        const b = fakeCloud({ unsent: [chat({ id: 'row-b', ownerId: 'uid-b', isFailed: true })] });
        const { outbox, sweep } = setup(
            { 'cloud-a': a.graph, 'cloud-b': b.graph },
            { 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' }
        );

        await sweep('cloud-a');
        vi.mocked(a.graph.chat.cacheReadList).mockClear();
        await sweep('cloud-a');
        await sweep('cloud-b');

        expect(a.graph.chat.cacheReadList).not.toHaveBeenCalled();
        expect(outbox.pending().map(entry => entry.id)).toEqual(['row-a', 'row-b']);
    });

    it('deletes the failed row in its own cloud, then sends to that cloud', async () => {
        const b = fakeCloud({ unsent: [chat({ id: 'row-b', ownerId: 'uid-b', isFailed: true, content: 'hi' })] });
        const { outbox, sweep, sendInCloud } = setup({ 'cloud-b': b.graph }, { 'cloud-b': 'uid-b' });

        await sweep('cloud-b');
        outbox.setReady('cloud-b', true);
        await outbox.flush();

        expect(b.cacheDelete).toHaveBeenCalledWith('row-b');
        expect(sendInCloud).toHaveBeenCalledWith(
            'cloud-b',
            expect.objectContaining({ channelId: 'ch-1', content: 'hi' })
        );
        expect(b.cacheDelete.mock.invocationCallOrder[0]).toBeLessThan(sendInCloud.mock.invocationCallOrder[0]);
    });

    describe('a failed read of unsent rows', () => {
        let warn: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
        });
        afterEach(() => {
            warn.mockRestore();
        });

        const failingChannel = (failing: Set<string>) => {
            const cloud = fakeCloud({
                unsent: [
                    chat({ id: 'row-bad', channelId: 'ch-bad', ownerId: 'uid-b', isFailed: true }),
                    chat({ id: 'row-ok', channelId: 'ch-ok', ownerId: 'uid-b', isFailed: true }),
                ],
            });
            const read = vi.mocked(cloud.graph.chat.cacheReadList);
            const healthy = read.getMockImplementation() as NonNullable<ReturnType<typeof read.getMockImplementation>>;
            read.mockImplementation(async query =>
                failing.has(query.channelId) ? Promise.reject(new Error('db locked')) : healthy(query)
            );
            return cloud;
        };

        it('logs the skipped channel and still sweeps the others', async () => {
            const cloud = failingChannel(new Set(['ch-bad']));
            const { outbox, sweep } = setup({ 'cloud-b': cloud.graph }, { 'cloud-b': 'uid-b' });

            await sweep('cloud-b');

            expect(outbox.pending().map(entry => entry.id)).toEqual(['row-ok']);
            expect(warn).toHaveBeenCalledWith(
                'CHAT',
                expect.stringContaining('skipped'),
                expect.objectContaining({ cid: 'cloud-b', channelIds: ['ch-bad'] })
            );
        });

        it('logs nothing when every read succeeds', async () => {
            const cloud = failingChannel(new Set());
            const { sweep } = setup({ 'cloud-b': cloud.graph }, { 'cloud-b': 'uid-b' });

            await sweep('cloud-b');
            expect(warn).not.toHaveBeenCalled();
        });

        it('picks the skipped channel up on the next sweep, once its read works again', async () => {
            const failing = new Set(['ch-bad', 'ch-ok']);
            const cloud = failingChannel(failing);
            const { outbox, sweep } = setup({ 'cloud-b': cloud.graph }, { 'cloud-b': 'uid-b' });

            await sweep('cloud-b');
            expect(outbox.pending()).toEqual([]);

            failing.clear();
            await sweep('cloud-b');

            expect(outbox.pending().map(entry => entry.id)).toEqual(['row-bad', 'row-ok']);
        });
    });

    it('keeps landing claims per cloud, so equal row ids in two clouds do not collide', async () => {
        const landedIn = (ownerId: string) => chat({ id: 'ch-1:7', chatNo: 7, ownerId, content: 'ok' });
        const failedIn = (ownerId: string) => chat({ id: 'row-1', ownerId, content: 'ok', isFailed: true });
        const a = fakeCloud({ unsent: [failedIn('uid-a')], landed: [landedIn('uid-a')] });
        const b = fakeCloud({ unsent: [failedIn('uid-b')], landed: [landedIn('uid-b')] });
        const { outbox, sweep, sendInCloud } = setup(
            { 'cloud-a': a.graph, 'cloud-b': b.graph },
            { 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' }
        );

        await sweep('cloud-a');
        await sweep('cloud-b');
        outbox.setReady('cloud-a', true);
        await outbox.flush();
        outbox.setReady('cloud-b', true);
        await outbox.flush();

        expect(sendInCloud).not.toHaveBeenCalled();
        expect(a.cacheDelete).toHaveBeenCalledWith('row-1');
        expect(b.cacheDelete).toHaveBeenCalledWith('row-1');
    });
});

describe('useChatOutbox', () => {
    beforeEach(() => {
        clouds.uids = { default: 'relay-uid', 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' };
        clouds.verified = [];
        clouds.graphs = { default: fakeCloud().graph, 'cloud-a': fakeCloud().graph, 'cloud-b': fakeCloud().graph };
        clouds.sendInCloud.mockReset().mockResolvedValue(undefined);
    });

    const verify = (cids: string[]) => {
        clouds.verified = [...cids];
    };

    it('sweeps a background cloud once its slot is verified and sends to that cloud', async () => {
        const b = fakeCloud({ unsent: [chat({ id: 'row-b', ownerId: 'uid-b', isFailed: true, content: 'hi' })] });
        clouds.graphs['cloud-b'] = b.graph;
        verify(['default', 'cloud-a']);
        const { rerender } = renderHook(() => useChatOutbox());
        await act(async () => getChatOutbox()?.flush());

        expect(clouds.sendInCloud).not.toHaveBeenCalled();

        verify(['default', 'cloud-a', 'cloud-b']);
        rerender();

        await waitFor(() =>
            expect(clouds.sendInCloud).toHaveBeenCalledWith('cloud-b', expect.objectContaining({ content: 'hi' }))
        );
        expect(b.cacheDelete).toHaveBeenCalledWith('row-b');
    });

    it('logs a sweep that fails outright instead of swallowing it', async () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const b = fakeCloud();
        vi.mocked(b.graph.channel.cacheReadList).mockRejectedValue(new Error('db locked'));
        clouds.graphs['cloud-b'] = b.graph;
        verify(['default', 'cloud-b']);
        renderHook(() => useChatOutbox());

        await waitFor(() =>
            expect(warn).toHaveBeenCalledWith(
                'CHAT',
                expect.stringContaining('sweep failed'),
                expect.objectContaining({ cid: 'cloud-b' })
            )
        );
        warn.mockRestore();
    });

    it('keeps one instance, and its queue, across a cloud switch', () => {
        verify(['default', 'cloud-a']);
        const { rerender } = renderHook(() => useChatOutbox());
        const outbox = getChatOutbox();
        outbox?.enqueue({
            id: 'row-c',
            cid: 'cloud-c',
            channelId: 'ch-1',
            payload: { channelId: 'ch-1', content: 'x' },
        });

        verify(['default', 'cloud-a', 'cloud-b']);
        rerender();

        expect(getChatOutbox()).toBe(outbox);
        expect(
            getChatOutbox()
                ?.pending('cloud-c')
                .map(entry => entry.id)
        ).toEqual(['row-c']);
    });

    it('builds a new instance when the relay account changes', () => {
        const { rerender } = renderHook(() => useChatOutbox());
        const outbox = getChatOutbox();

        clouds.uids = { ...clouds.uids, default: 'promoted-relay-uid' };
        rerender();

        expect(getChatOutbox()).not.toBe(outbox);
        expect(getChatOutbox()).not.toBeNull();
    });

    it('stops sending to a cloud whose slot dropped', async () => {
        verify(['default', 'cloud-b']);
        const { rerender } = renderHook(() => useChatOutbox());
        verify(['default']);
        rerender();

        getChatOutbox()?.enqueue({
            id: 'row-b',
            cid: 'cloud-b',
            channelId: 'ch-1',
            payload: { channelId: 'ch-1', content: 'x' },
        });
        await act(async () => getChatOutbox()?.flush());

        expect(clouds.sendInCloud).not.toHaveBeenCalled();
        expect(getChatOutbox()?.pending('cloud-b')).toHaveLength(1);
    });

    it('drops the singleton on unmount', () => {
        const { unmount } = renderHook(() => useChatOutbox());
        unmount();

        expect(getChatOutbox()).toBeNull();
    });
});
