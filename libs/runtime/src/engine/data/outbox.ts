import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

export interface OutboxEntry {
    id: string;
    cid: string;
    channelId: string;
    payload: ChatSendInput;
    enqueuedAt: number;
}

export type OutboxEnqueueInput = Pick<OutboxEntry, 'id' | 'cid' | 'channelId' | 'payload'>;

export interface ChatOutboxOptions {
    send(entry: OutboxEntry): Promise<unknown>;
    hasLanded(entry: OutboxEntry): Promise<boolean>;
    discard(entry: OutboxEntry): Promise<void>;
    now?(): number;
}

export interface ChatOutbox {
    start(): void;
    stop(): void;
    setReady(cid: string, ready: boolean): void;
    enqueue(input: OutboxEnqueueInput): void;
    remove(id: string): void;
    pending(cid?: string): readonly OutboxEntry[];
    flush(): Promise<void>;
}

const queueKeyOf = (cid: string, channelId: string): string => `${cid}|${channelId}`;

export const createChatOutbox = (options: ChatOutboxOptions): ChatOutbox => {
    const { send, hasLanded, discard, now = Date.now } = options;

    const queues = new Map<string, OutboxEntry[]>();
    const chains = new Map<string, Promise<void>>();
    const scheduled = new Set<string>();
    const readyClouds = new Set<string>();
    let running = false;

    const dequeue = (queue: OutboxEntry[], entry: OutboxEntry): void => {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
    };

    const drainChannel = async (key: string): Promise<void> => {
        const queue = queues.get(key);
        while (running && queue?.length && readyClouds.has(queue[0].cid)) {
            const entry = queue[0];
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
                dequeue(queue, entry);
            }
        }
        if (queue && !queue.length && queues.get(key) === queue) queues.delete(key);
    };

    const drain = (key: string): Promise<void> => {
        const previous = chains.get(key);
        if (scheduled.has(key)) return previous ?? Promise.resolve();
        scheduled.add(key);
        const pass = () => {
            scheduled.delete(key);
            return drainChannel(key);
        };
        const next = (previous ?? Promise.resolve()).then(pass, pass);
        chains.set(
            key,
            next.then(
                () => undefined,
                () => undefined
            )
        );
        return next;
    };

    const drainWhere = (matches: (entry: OutboxEntry) => boolean): void =>
        [...queues.entries()].forEach(([key, queue]) => {
            if (queue.length && matches(queue[0])) void drain(key);
        });

    return {
        start: () => {
            running = true;
            drainWhere(() => true);
        },
        stop: () => {
            running = false;
        },
        setReady: (cid, next) => {
            if (next === readyClouds.has(cid)) return;
            if (!next) {
                readyClouds.delete(cid);
                return;
            }
            readyClouds.add(cid);
            drainWhere(entry => entry.cid === cid);
        },
        enqueue: input => {
            const key = queueKeyOf(input.cid, input.channelId);
            const queue = queues.get(key) ?? [];
            if (queue.some(entry => entry.id === input.id)) return;
            queue.push({ ...input, enqueuedAt: now() });
            queues.set(key, queue);
            void drain(key);
        },
        remove: id => {
            for (const [key, queue] of queues) {
                const index = queue.findIndex(entry => entry.id === id);
                if (index < 0) continue;
                queue.splice(index, 1);
                if (!queue.length) queues.delete(key);
                return;
            }
        },
        pending: cid => [...queues.values()].flat().filter(entry => !cid || entry.cid === cid),
        flush: async () => {
            await Promise.all([...chains.values()]);
        },
    };
};
