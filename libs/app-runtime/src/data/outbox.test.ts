import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import { createChatOutbox, type ChatOutbox, type ChatOutboxOptions, type OutboxEntry } from './outbox';

const payload = (channelId: string, content: string): ChatSendInput => ({ channelId, content });

interface Harness {
    outbox: ChatOutbox;
    send: jest.MockedFunction<ChatOutboxOptions['send']>;
    hasLanded: jest.MockedFunction<ChatOutboxOptions['hasLanded']>;
    discard: jest.MockedFunction<ChatOutboxOptions['discard']>;
    onExhausted: jest.MockedFunction<NonNullable<ChatOutboxOptions['onExhausted']>>;
    sentIds: () => string[];
}

const harness = (over: Partial<ChatOutboxOptions> = {}): Harness => {
    const send = jest.fn<Promise<unknown>, [OutboxEntry]>().mockResolvedValue(undefined);
    const hasLanded = jest.fn<Promise<boolean>, [OutboxEntry]>().mockResolvedValue(false);
    const discard = jest.fn<Promise<void>, [OutboxEntry]>().mockResolvedValue(undefined);
    const onExhausted = jest.fn();
    const outbox = createChatOutbox({ send, hasLanded, discard, onExhausted, baseBackoffMs: 1000, ...over });

    return { outbox, send, hasLanded, discard, onExhausted, sentIds: () => send.mock.calls.map(([e]) => e.id) };
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

    it('drains channels independently — a stuck channel does not block another', async () => {
        const { outbox, send, sentIds } = harness();
        send.mockImplementation(entry =>
            entry.channelId === 'ch-1' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
        );
        outbox.start();

        outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
        outbox.enqueue({ id: 'b', channelId: 'ch-2', payload: payload('ch-2', 'b') });
        outbox.setReady(true);
        await outbox.flush();

        expect(sentIds()).toEqual(['a', 'b']);
        expect(outbox.pending('ch-1')).toHaveLength(1);
        expect(outbox.pending('ch-2')).toHaveLength(0);
    });

    describe('retry budget', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('holds the failing head in place and retries it after the backoff', async () => {
            const { outbox, send, sentIds } = harness();
            send.mockRejectedValueOnce(new Error('boom'));
            outbox.start();

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.enqueue({ id: 'b', channelId: 'ch-1', payload: payload('ch-1', 'b') });
            outbox.setReady(true);
            await outbox.flush();

            // The head failed, so its successor must NOT overtake it.
            expect(sentIds()).toEqual(['a']);
            expect(outbox.pending('ch-1').map(e => e.id)).toEqual(['a', 'b']);

            jest.advanceTimersByTime(1000);
            await outbox.flush();

            expect(sentIds()).toEqual(['a', 'a', 'b']);
            expect(outbox.pending()).toHaveLength(0);
        });

        it('retires an entry after maxAttempts, leaving its failed row for the manual retry button', async () => {
            const { outbox, send, discard, onExhausted } = harness({ maxAttempts: 2 });
            send.mockRejectedValue(new Error('boom'));
            outbox.start();

            outbox.enqueue({ id: 'a', channelId: 'ch-1', payload: payload('ch-1', 'a') });
            outbox.setReady(true);
            await outbox.flush();

            jest.advanceTimersByTime(1000);
            await outbox.flush();

            expect(send).toHaveBeenCalledTimes(2);
            expect(onExhausted).toHaveBeenCalledTimes(1);
            expect(onExhausted.mock.calls[0][0].id).toBe('a');
            // The row stays `isFailed` — retiring the queue entry must not delete the user's message.
            expect(discard).not.toHaveBeenCalled();
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
