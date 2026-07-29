import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

/**
 * Resend queue for chat sends that failed while the transport was down.
 *
 * **One attempt per ready transition, and that is structural — not a policy knob.**
 * `ChatRepositoryV2.sendChat` mints a NEW optimistic row on every call
 * (`optimistic-chat-send-${Date.now()}`) and, on failure, leaves *that* row marked `isFailed`.
 * A queue entry only knows the id of the row it was built from, so a second attempt cannot reach
 * the row the first attempt left behind: the user would see one "not delivered" bubble per attempt
 * for a single message. So this machine sends once and drops the entry; whatever is still failed is
 * picked up by the caller's next sweep, with its current row id. There is deliberately no attempt
 * counter and no backoff timer — they could not be enabled correctly by any caller until the wire
 * carries an idempotency key and the repository reuses the optimistic row.
 *
 * **Guarantee: at-least-once, in order, per channel.** Not exactly-once — the server has
 * delegated dedupe, retry and ordering to the client but the wire carries no idempotency key:
 * `chat.send`'s request (`{channelId, content, contentType?, parentId?, stereo?, subType?}`) has
 * no client-id field and `ChatView` echoes none back, so a resend cannot be matched to its
 * original by id. The ack does return a real `chatNo`, so the only ambiguous case is a LOST ACK:
 * the server appended the message, we never heard, and the row sits marked `isFailed`.
 *
 * That case is resolved by the injected `hasLanded` probe, and its answer is asymmetric the same
 * way `navigator.onLine` is:
 * - `true` is a strong signal — the message is already in the timeline (the reconnect catch-up
 *   pulled it in), so the resend is dropped and the stale local row discarded.
 * - `false` does NOT prove it never landed — it means we could not find it. We resend and accept
 *   a possible duplicate, because losing the user's message is the worse failure.
 *
 * The outbox holds no opinion about how landing is decided; that heuristic belongs at the wiring
 * point, which can reach the chat cache. Likewise chatNo-based merge/gap-fill is NOT re-implemented
 * here — the SDK's `ChatSyncPlan` already drops `<= lastNo`, appends `lastNo + 1` and gap-fills via
 * `chat.feed`.
 *
 * **Activation is the app opt-in.** The machine is inert until `start()`, and `apps/web` never
 * constructs one — it keeps its manual resend button.
 */

/** One queued send. `id` is the client-side key (the failed optimistic row's cache id). */
export interface OutboxEntry {
    id: string;
    channelId: string;
    payload: ChatSendInput;
    enqueuedAt: number;
}

export type OutboxEnqueueInput = Pick<OutboxEntry, 'id' | 'channelId' | 'payload'>;

export interface ChatOutboxOptions {
    /** Performs the actual send. Rejecting keeps the entry queued for the next attempt. */
    send(entry: OutboxEntry): Promise<unknown>;
    /** Has an equivalent message already landed server-side? See the asymmetry above. */
    hasLanded(entry: OutboxEntry): Promise<boolean>;
    /** Drops the stale local row once `hasLanded` says the send already succeeded. */
    discard(entry: OutboxEntry): Promise<void>;
    now?(): number;
}

export interface ChatOutbox {
    /** Activates the machine. Until this is called nothing is sent. */
    start(): void;
    /** Deactivates; the queue is kept. */
    stop(): void;
    /** Whether the transport can carry a send — pass `isConnected && isVerified`. */
    setReady(ready: boolean): void;
    enqueue(input: OutboxEnqueueInput): void;
    /** Removes a queued entry, e.g. when the user hits manual retry for it. */
    remove(id: string): void;
    pending(channelId?: string): readonly OutboxEntry[];
    /** Resolves once every channel's in-flight drain has settled. */
    flush(): Promise<void>;
}

export const createChatOutbox = (options: ChatOutboxOptions): ChatOutbox => {
    const { send, hasLanded, discard, now = Date.now } = options;

    // Per channel, because order only has to hold WITHIN a channel — a stuck channel must not
    // block another's queue.
    const queues = new Map<string, OutboxEntry[]>();
    const chains = new Map<string, Promise<void>>();
    const scheduled = new Set<string>();
    let running = false;
    let ready = false;

    // Remove by IDENTITY, never by position: `remove()` can splice the queue from a UI event while
    // this drain is awaiting, and a positional shift would then drop whichever entry slid into
    // index 0 — silently retiring a message nobody sent.
    const dequeue = (queue: OutboxEntry[], entry: OutboxEntry): void => {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
    };

    const drainChannel = async (channelId: string): Promise<void> => {
        const queue = queues.get(channelId);
        while (running && ready && queue?.length) {
            const entry = queue[0];
            // A probe that cannot answer is treated as "not found" — resend, per the at-least-once
            // contract above.
            const landed = await hasLanded(entry).catch(() => false);
            if (landed) {
                dequeue(queue, entry);
                await discard(entry).catch(() => undefined);
                continue;
            }
            try {
                await send(entry);
                dequeue(queue, entry);
            } catch {
                // Retire the entry, never the message: the row keeps its `isFailed` marking, so the
                // manual retry button stays the user's way out and the caller's next sweep re-queues
                // it under whatever row id it carries by then.
                dequeue(queue, entry);
            }
        }
        if (queue && !queue.length) queues.delete(channelId);
    };

    // Serialize read-modify-write per channel, the same shape ChatSyncPlan uses, so a reconnect
    // firing mid-drain cannot start a second pass over the same queue. Drains also COLLAPSE: a pass
    // that has not started yet already covers whatever arrived since, and stacking a second one
    // would re-send the entry the first is about to take (enqueue + a ready transition in the same
    // tick is the normal reconnect shape).
    const drain = (channelId: string): Promise<void> => {
        const previous = chains.get(channelId);
        if (scheduled.has(channelId)) return previous ?? Promise.resolve();
        scheduled.add(channelId);
        const pass = () => {
            scheduled.delete(channelId);
            return drainChannel(channelId);
        };
        const next = (previous ?? Promise.resolve()).then(pass, pass);
        chains.set(
            channelId,
            next.then(
                () => undefined,
                () => undefined
            )
        );
        return next;
    };

    const drainAll = (): void => [...queues.keys()].forEach(channelId => void drain(channelId));

    return {
        start: () => {
            running = true;
            drainAll();
        },
        stop: () => {
            running = false;
        },
        setReady: (next: boolean) => {
            if (next === ready) return;
            ready = next;
            if (ready) drainAll();
        },
        enqueue: input => {
            const queue = queues.get(input.channelId) ?? [];
            if (queue.some(entry => entry.id === input.id)) return;
            queue.push({ ...input, enqueuedAt: now() });
            queues.set(input.channelId, queue);
            void drain(input.channelId);
        },
        remove: id => {
            for (const [channelId, queue] of queues) {
                const index = queue.findIndex(entry => entry.id === id);
                if (index < 0) continue;
                queue.splice(index, 1);
                if (!queue.length) queues.delete(channelId);
                return;
            }
        },
        pending: channelId => (channelId ? [...(queues.get(channelId) ?? [])] : [...queues.values()].flat()),
        flush: async () => {
            await Promise.all([...chains.values()]);
        },
    };
};
