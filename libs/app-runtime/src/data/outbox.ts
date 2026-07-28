import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

/**
 * Retry queue for chat sends that failed while the transport was down.
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
    /** Failed send attempts so far, against `maxAttempts`. */
    attempts: number;
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
    /**
     * The entry ran out of attempts and left the queue. Its row keeps the existing `isFailed`
     * marking, so the manual retry button remains the user's way out.
     */
    onExhausted?(entry: OutboxEntry, error: unknown): void;
    maxAttempts?: number;
    baseBackoffMs?: number;
    maxBackoffMs?: number;
    now?(): number;
}

export interface ChatOutbox {
    /** Activates the machine. Until this is called nothing is sent. */
    start(): void;
    /** Deactivates and cancels pending retries; the queue is kept. */
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

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

export const createChatOutbox = (options: ChatOutboxOptions): ChatOutbox => {
    const {
        send,
        hasLanded,
        discard,
        onExhausted,
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
        maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
        now = Date.now,
    } = options;

    // Per channel, because order only has to hold WITHIN a channel — a stuck channel must not
    // block another's queue.
    const queues = new Map<string, OutboxEntry[]>();
    const chains = new Map<string, Promise<void>>();
    const scheduled = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let running = false;
    let ready = false;

    const clearTimer = (channelId: string): void => {
        const timer = timers.get(channelId);
        if (timer === undefined) return;
        clearTimeout(timer);
        timers.delete(channelId);
    };

    const clearTimers = (): void => [...timers.keys()].forEach(clearTimer);

    const scheduleRetry = (channelId: string, attempts: number): void => {
        clearTimer(channelId);
        const delay = Math.min(baseBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
        timers.set(
            channelId,
            setTimeout(() => {
                timers.delete(channelId);
                void drain(channelId);
            }, delay)
        );
    };

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
            } catch (error) {
                entry.attempts += 1;
                if (entry.attempts < maxAttempts) {
                    scheduleRetry(channelId, entry.attempts);
                    return;
                }
                dequeue(queue, entry);
                onExhausted?.(entry, error);
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
            clearTimers();
        },
        setReady: (next: boolean) => {
            if (next === ready) return;
            ready = next;
            // A backoff timer armed against the old connection is meaningless; the next ready
            // transition drains everything anyway.
            if (!ready) return clearTimers();
            drainAll();
        },
        enqueue: input => {
            const queue = queues.get(input.channelId) ?? [];
            if (queue.some(entry => entry.id === input.id)) return;
            queue.push({ ...input, attempts: 0, enqueuedAt: now() });
            queues.set(input.channelId, queue);
            void drain(input.channelId);
        },
        remove: id => {
            for (const [channelId, queue] of queues) {
                const index = queue.findIndex(entry => entry.id === id);
                if (index < 0) continue;
                queue.splice(index, 1);
                if (!queue.length) {
                    queues.delete(channelId);
                    clearTimer(channelId);
                }
                return;
            }
        },
        pending: channelId => (channelId ? [...(queues.get(channelId) ?? [])] : [...queues.values()].flat()),
        flush: async () => {
            await Promise.all([...chains.values()]);
        },
    };
};
