import { describe, expect, it, vi } from 'vitest';

import type { DomainChat } from '@chatic/data';
import { createChatOutbox, type OutboxEntry } from '@chatic/app-runtime';

import { createLandingBatch, matchLandedRow, selectResendableRows, toSendPayload } from './useChatOutbox';

const MY_UID = 'u1';
// Real wall clock: the outbox stamps `enqueuedAt` with Date.now(), and the landing probe's skew
// window is relative to it — a fixed past constant would fall outside the window every time.
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
        // The rotation case: sent at T, reconnect ~100min later. Anchoring the window to the
        // enqueue time would reject this and resend an already-delivered message.
        const sentAt = NOW - 100 * 60_000;
        const landed = chat({ id: 'ch-1:7', chatNo: 7, createdAtMs: sentAt + 1_000 });
        expect(matchLandedRow([landed], query({ sentAt }), new Set())?.id).toBe('ch-1:7');
    });
});

describe('createLandingBatch', () => {
    const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
        id: 'row-1',
        channelId: 'ch-1',
        payload: { channelId: 'ch-1', content: 'hello' },
        attempts: 0,
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
        // The manual retry path: outbox.remove() drops the entry between match and discard.
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        expect(batch.match(rows, entry({ id: 'a' }), MY_UID)?.id).toBe('ch-1:7');
        // 'a' never commits. The row must stay matchable for a later entry.
        expect(batch.match(rows, entry({ id: 'b' }), MY_UID)?.id).toBe('ch-1:7');
    });

    it('keeps claims across sweeps — a later drain cannot re-consume a committed row', () => {
        // Lifetime is the OUTBOX INSTANCE: a drain after the ~100min rotation must not re-match
        // a row an earlier drain already consumed.
        const batch = createLandingBatch();
        const rows = [chat({ id: 'ch-1:7', chatNo: 7 })];

        batch.match(rows, entry({ id: 'a' }), MY_UID);
        batch.commit('a');

        // A brand-new sweep, new entry id, same cache — the committed row stays claimed.
        expect(batch.match(rows, entry({ id: 'a2' }), MY_UID)).toBeNull();
    });

    it('uses the recorded send time, so a reconnect hours later still matches', () => {
        const sentAt = NOW - 100 * 60_000;
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, createdAtMs: sentAt + 1_000 })];

        // Without record(), the enqueuedAt anchor (NOW) puts the twin far outside the window.
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
    // Exactly the wiring useChatOutbox builds: match in hasLanded, claim in discard.
    const harness = (rows: DomainChat[], batch = createLandingBatch()) => {
        const send = vi.fn().mockResolvedValue(undefined);
        const discard = vi.fn().mockImplementation(async (entry: OutboxEntry) => {
            batch.commit(entry.id);
        });
        const outbox = createChatOutbox({
            maxAttempts: 1,
            send,
            discard,
            hasLanded: async entry => !!batch.match(rows, entry, MY_UID),
        });
        return { outbox, send, discard, batch };
    };

    const enqueueTwoIdentical = (outbox: ReturnType<typeof harness>['outbox']) => {
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        outbox.enqueue({ id: 'b', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
    };

    it('sends the second of two identical messages when only ONE of them landed', async () => {
        // The defect this pins: content is not unique. Without the consumed set both entries
        // match the same landed row and the user's second message is silently deleted.
        const { outbox, send, discard } = harness([chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })]);

        outbox.start();
        enqueueTwoIdentical(outbox);
        outbox.setReady(true);
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
        outbox.setReady(true);
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(discard).toHaveBeenCalledTimes(2);
    });

    it('holds a committed claim across sweeps, so the next sweep sends instead of swallowing', async () => {
        // Claims live for the outbox INSTANCE. After the rotation, a still-failed row with the same
        // text is a DIFFERENT message (the first one's row was deleted on discard) and must be sent.
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })];

        const first = harness(rows);
        first.outbox.start();
        first.outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        first.outbox.setReady(true);
        await first.outbox.flush();
        expect(first.discard).toHaveBeenCalledTimes(1);

        // Second sweep after a rotation: same cache, same content, SAME batch (same outbox).
        const second = harness(rows, first.batch);
        second.outbox.start();
        second.outbox.enqueue({ id: 'a2', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        second.outbox.setReady(true);
        await second.outbox.flush();

        expect(second.discard).not.toHaveBeenCalled();
        expect(second.send).toHaveBeenCalledTimes(1);
    });

    it('a failed discard leaves the row unclaimed, so the next sweep can still match it', async () => {
        // Claim-on-commit: if the cache delete throws, nothing was consumed, and the message must
        // not become permanently unmatchable (which would resend an already-delivered message).
        const rows = [chat({ id: 'ch-1:7', chatNo: 7, content: 'ok' })];
        const batch = createLandingBatch();
        const outbox = createChatOutbox({
            maxAttempts: 1,
            send: vi.fn().mockResolvedValue(undefined),
            discard: vi.fn().mockRejectedValue(new Error('cache delete failed')),
            hasLanded: async entry => !!batch.match(rows, entry, MY_UID),
        });

        outbox.start();
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        outbox.setReady(true);
        await outbox.flush();

        const retry = harness(rows, batch);
        retry.outbox.start();
        retry.outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        retry.outbox.setReady(true);
        await retry.outbox.flush();

        expect(retry.discard).toHaveBeenCalledTimes(1);
        expect(retry.send).not.toHaveBeenCalled();
    });

    it('attempts a queued message once per ready-transition (maxAttempts 1)', async () => {
        // sendChat mints a new optimistic row per call, so a second in-connection attempt would
        // orphan the first attempt's failed row next to it.
        const send = vi.fn().mockRejectedValue(new Error('still down'));
        const onExhausted = vi.fn();
        const outbox = createChatOutbox({
            maxAttempts: 1,
            send,
            discard: vi.fn().mockResolvedValue(undefined),
            hasLanded: async () => false,
            onExhausted,
        });

        outbox.start();
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: { channelId: 'ch-1', content: 'ok' } });
        outbox.setReady(true);
        await outbox.flush();

        expect(send).toHaveBeenCalledTimes(1);
        expect(onExhausted).toHaveBeenCalledTimes(1);
        expect(outbox.pending()).toHaveLength(0);
    });
});
