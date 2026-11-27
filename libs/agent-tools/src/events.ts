import type { AgentIncoming, AgentMessage } from './backend';

export type EventKind = 'mention' | 'dm' | 'thread_reply' | 'room';

export interface AgentEvent {
    seq: number;
    kind: EventKind;
    message: AgentMessage & { kinds: EventKind[] };
}

export interface EventPage {
    events: AgentEvent[];
    cursor: number;
}

export interface EventQuery {
    since: number;
    limit: number;
    tail?: boolean;
}

export interface EventLogOptions {
    me: string;
    isRoomAllowed: (channelId: string) => boolean;
    capacity?: number;
}

export interface EventLog {
    push(incoming: AgentIncoming): void;
    since(query: EventQuery): EventPage;
    wait(query: EventQuery, timeoutMs: number): Promise<EventPage>;
}

const DEFAULT_CAPACITY = 500;

const kindsOf = (incoming: AgentIncoming, options: EventLogOptions): EventKind[] => {
    const { message } = incoming;
    if (message.ownerId === options.me) return [];
    const kinds: EventKind[] = [];
    if (message.mention.all || message.mention.userIds.includes(options.me)) kinds.push('mention');
    if (incoming.isDirect) kinds.push('dm');
    if (incoming.repliesToMe) kinds.push('thread_reply');
    if (options.isRoomAllowed(message.channelId)) kinds.push('room');
    return kinds;
};

export const createEventLog = (options: EventLogOptions): EventLog => {
    const capacity = options.capacity ?? DEFAULT_CAPACITY;
    const entries: AgentEvent[] = [];
    const visible = (entry: AgentEvent): boolean => options.isRoomAllowed(entry.message.channelId);
    const waiters = new Set<() => void>();
    let seq = 0;

    const read = ({ since, limit, tail }: EventQuery): EventPage => {
        const from = tail ? Math.max(seq - limit, 0) : since;
        const events = entries.filter(entry => entry.seq > from && visible(entry)).slice(0, limit);
        return { events, cursor: events.length > 0 ? events[events.length - 1].seq : from };
    };

    return {
        push(incoming) {
            const kinds = kindsOf(incoming, options);
            if (kinds.length === 0) return;
            seq += 1;
            entries.push({ seq, kind: kinds[0], message: { ...incoming.message, kinds } });
            if (entries.length > capacity) entries.shift();
            [...waiters].forEach(wake => wake());
        },
        since: read,
        wait(query, timeoutMs) {
            const found = read(query);
            if (found.events.length > 0 || timeoutMs <= 0) return Promise.resolve(found);
            return new Promise(resolve => {
                const finish = (): void => {
                    clearTimeout(timer);
                    waiters.delete(finish);
                    resolve(read(query));
                };
                const timer = setTimeout(finish, timeoutMs);
                waiters.add(finish);
            });
        },
    };
};
