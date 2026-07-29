import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import { createChatOutbox, type ChatOutbox, type ChatOutboxOptions, type OutboxEntry } from './outbox';

const payload = (channelId: string, content: string): ChatSendInput => ({ channelId, content });

interface Harness {
    outbox: ChatOutbox;
    send: jest.MockedFunction<ChatOutboxOptions['send']>;
    hasLanded: jest.MockedFunction<ChatOutboxOptions['hasLanded']>;
    discard: jest.MockedFunction<ChatOutboxOptions['discard']>;
    sentIds: () => string[];
}

const harness = (over: Partial<ChatOutboxOptions> = {}): Harness => {
    const send = jest.fn<Promise<unknown>, [OutboxEntry]>().mockResolvedValue(undefined);
    const hasLanded = jest.fn<Promise<boolean>, [OutboxEntry]>().mockResolvedValue(false);
    const discard = jest.fn<Promise<void>, [OutboxEntry]>().mockResolvedValue(undefined);
    const outbox = createChatOutbox({ send, hasLanded, discard, ...over });

    return { outbox, send, hasLanded, discard, sentIds: () => send.mock.calls.map(([e]) => e.id) };
};

/** Bring the outbox to the state it lives in on desktop: activated and on a verified socket. */
const activate = async (outbox: ChatOutbox) => {
    outbox.start();
    outbox.setReady(true);
    await outbox.flush();
};

describe('createChatOutbox', () => {
    it('is inert until start() — activation is the app opt-in, not the import', async () => {
        const { outbox, send } = harness();

        outbox.setReady(true);
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(outbox.pending()).toHaveLength(1);
    });

    it('preserves send order within a channel', async () => {
        const { outbox, send, sentIds } = harness();
        outbox.start();

        ['a', 'b', 'c'].forEach(id => outbox.enqueue({ id, channelId: 'ch-1', payload: payload('ch-1', id) }));
        outbox.setReady(true);
        await outbox.flush();

        expect(send).toHaveBeenCalledTimes(3);
        expect(sentIds()).toEqual(['a', 'b', 'c']);
        expect(outbox.pending()).toHaveLength(0);
    });

    it('does not drain while the transport is not ready (connected-but-unverified handshake)', async () => {
        const { outbox, send } = harness();
        outbox.start();

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        await outbox.flush();
        expect(send).not.toHaveBeenCalled();

        outbox.setReady(true);
        await outbox.flush();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('ignores a duplicate enqueue of the same entry id', async () => {
        const { outbox, send } = harness();
        outbox.start();

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        outbox.setReady(true);
        await outbox.flush();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('drops a queued entry on remove() so the manual retry button stays authoritative', async () => {
        const { outbox, send } = harness();
        outbox.start();

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        outbox.remove('a');
        outbox.setReady(true);
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(outbox.pending()).toHaveLength(0);
    });

    it('does not retire the wrong entry when remove() races an in-flight drain', async () => {
        const { outbox, hasLanded, sentIds } = harness();
        let release: () => void = () => undefined;
        let entered: () => void = () => undefined;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const drainParked = new Promise<void>(resolve => {
            entered = resolve;
        });
        // Hold the head's probe open so remove() can splice the queue while the drain is already
        // holding that entry — the manual retry button firing mid-flight is exactly this shape.
        hasLanded.mockImplementationOnce(async () => {
            entered();
            await gate;
            return false;
        });
        outbox.start();

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
        outbox.enqueue({ id: 'b', channelId: 'ch-1', payload: payload('ch-1', 'b') });
        outbox.setReady(true);

        await drainParked;
        outbox.remove('a');
        release();
        await outbox.flush();

        // A positional shift would have dropped 'b' — the entry that slid into index 0 — and it
        // would never have been sent by anyone.
        expect(sentIds()).toEqual(['a', 'b']);
        expect(outbox.pending()).toHaveLength(0);
    });

    it('stops draining after stop()', async () => {
        const { outbox, send } = harness();
        await activate(outbox);

        outbox.stop();
        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'hi') });
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(outbox.pending()).toHaveLength(1);
    });

    it('drains channels independently — a rejecting channel does not stop another', async () => {
        const { outbox, send, sentIds } = harness();
        send.mockImplementation(entry =>
            entry.channelId === 'ch-1' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
        );

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
        outbox.enqueue({ id: 'b', channelId: 'ch-2', payload: payload('ch-2', 'b') });
        await activate(outbox);

        expect(sentIds()).toEqual(['a', 'b']);
        expect(outbox.pending()).toHaveLength(0);
    });

    describe('a failed send', () => {
        it('retires the entry without a second attempt, and never discards the row', async () => {
            // One attempt per ready transition is structural: sendChat mints a new optimistic row
            // per call, so attempt 2 would strand attempt 1's failed row next to its own.
            const { outbox, send, discard, sentIds } = harness();
            send.mockRejectedValueOnce(new Error('boom'));

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            await activate(outbox);

            expect(sentIds()).toEqual(['a']);
            expect(outbox.pending()).toHaveLength(0);
            // Retiring the queue entry must not delete the user's message — the row keeps its
            // `isFailed` marking so the manual retry button stays authoritative.
            expect(discard).not.toHaveBeenCalled();
        });

        it('does not block the entries behind it', async () => {
            const { outbox, send, sentIds } = harness();
            send.mockRejectedValueOnce(new Error('boom'));

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.enqueue({ id: 'b', channelId: 'ch-1', payload: payload('ch-1', 'b') });
            await activate(outbox);

            expect(sentIds()).toEqual(['a', 'b']);
            expect(outbox.pending()).toHaveLength(0);
        });
    });

    describe('connection rotation', () => {
        // API Gateway connections live ~110min and rotate 10min early, so every long session
        // reconnects and runs the ChatSyncPlan catch-up (lastNo -> channel.chatNo, cap 50).
        it('survives the reconnect with its queue intact', async () => {
            const { outbox, send } = harness();
            outbox.start();

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.setReady(false);
            expect(outbox.pending()).toHaveLength(1);

            outbox.setReady(true);
            await outbox.flush();

            expect(send).toHaveBeenCalledTimes(1);
        });

        it('does not re-send an entry the catch-up already pulled in (no double append)', async () => {
            const { outbox, send, hasLanded, discard } = harness();
            // The original send reached the server but its ack was lost, so the row is marked
            // failed locally while the message exists server-side. The reconnect catch-up pulls
            // it into the cache; the landing probe sees it and the resend must be dropped.
            hasLanded.mockResolvedValue(true);
            outbox.start();

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.setReady(true);
            await outbox.flush();

            expect(send).not.toHaveBeenCalled();
            expect(discard).toHaveBeenCalledTimes(1);
            expect(discard.mock.calls[0][0].id).toBe('a');
            expect(outbox.pending()).toHaveLength(0);
        });

        it('still resends the entries the catch-up did NOT bring back, in order', async () => {
            const { outbox, sentIds, hasLanded } = harness();
            hasLanded.mockImplementation(entry => Promise.resolve(entry.id === 'a'));
            outbox.start();

            ['a', 'b', 'c'].forEach(id => outbox.enqueue({ id, channelId: 'ch-1', payload: payload('ch-1', id) }));
            outbox.setReady(true);
            await outbox.flush();

            expect(sentIds()).toEqual(['b', 'c']);
        });

        it('resends when the landing probe itself fails — at-least-once, never silently dropped', async () => {
            const { outbox, send, hasLanded } = harness();
            hasLanded.mockRejectedValue(new Error('cache unavailable'));
            outbox.start();

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.setReady(true);
            await outbox.flush();

            expect(send).toHaveBeenCalledTimes(1);
        });
    });
});
