import type { DomainJoin } from '../domain';
import type { DataRepositories } from '../repositories';

/** The state writes that go through the outbox, with the value each one sets. */
export interface OutboxValues {
    'join.read': number;
    'join.notify': DomainJoin['notify'];
    'join.nick': string;
}

/** One per piece of state a repository can set. */
export type OutboxOp = keyof OutboxValues;

/**
 * One state write, as data: `key` set to `value` for the account `uid` in the cloud `cid`.
 *
 * Data rather than a function, on purpose. A closure over the graph that made the write would send
 * through whichever socket that graph resolves when the write finally goes out — the selected cloud's,
 * which may have changed by then. A write that names its cloud is sent through that cloud's graph.
 */
export interface StateWrite<V = unknown> {
    op: OutboxOp;
    cid: string;
    /** The account's uid in `cid` when the write was made. A write from another account is dropped. */
    uid: string;
    key: string;
    value: V;
    /** The local value this write replaced — what a refusal puts back when the server accepted none. */
    previous?: V;
}

/**
 * Thrown by a delivery that can never succeed for reasons on this side — a precondition the repository
 * checks before the socket, such as my join row having gone. The outbox treats it as a refusal.
 */
export class OutboxRefusalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OutboxRefusalError';
    }
}

/** What a repository hands back once the local half is done. */
export interface WriteReceipt {
    /**
     * Resolves once the server has accepted this value or a later one for the same key, and rejects
     * only when it was refused for good (or the account changed before it went out). Stays pending
     * while the cloud's socket is down, so nothing that drives the screen should wait on it.
     */
    delivered: Promise<void>;
}

/** The outbox as repositories see it. */
export interface OutboxPort {
    set<V>(write: StateWrite<V>): WriteReceipt;
}

/**
 * What the host supplies: when a cloud can carry a request, how to run work against that cloud's
 * graph, and how to read a failure. `libs/data` owns what is sent and how values combine; the
 * connection's lifecycle and timing belong to the runtime, which is why they come in through here.
 */
export interface OutboxTransport {
    /** Calls `listener` with whether `cid`'s socket is verified — now, then on every change. */
    watchReady(cid: string, listener: (ready: boolean) => void): () => void;
    /** Runs `work` against `cid`'s repository graph, keeping that cloud's socket until it settles. */
    inCloud<T>(cid: string, work: (repositories: DataRepositories) => Promise<T>): Promise<T>;
    /** The account's uid in `cid` now, to drop writes another account made; `null` when unknown. */
    uidOf(cid: string): string | null;
    /** Whether `error` means the value can never land, so retrying is pointless. */
    isRefusal(error: unknown): boolean;
    /** Delays before each retry while the socket stays ready; its length is the number of retries. */
    retryDelaysMs: readonly number[];
    setTimer(callback: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
}

/** How one piece of state behaves in the outbox. */
export interface StateSpec<V> {
    op: OutboxOp;
    /** Folds `next` into a value still waiting to be sent. Default: `next` replaces it. */
    merge?(waiting: V, next: V): V;
    /**
     * Whether the server already has `next`, judged from what this outbox saw it accept. Consulted only
     * while nothing waits for the key — and only safe for state another device cannot move back, such
     * as a read cursor. A setting changed elsewhere would make the outbox skip a write the server needs.
     */
    isCovered?(accepted: V, next: V): boolean;
    /** Sends the value through `repositories` — the write's own cloud — and returns the server's answer. */
    deliver(repositories: DataRepositories, write: StateWrite<V>): Promise<unknown>;
    /**
     * Records the server's answer locally — its own field only, since several states can share one row
     * and another may still be waiting. Skipped when a newer value of this key is already waiting.
     */
    accept?(repositories: DataRepositories, write: StateWrite<V>, answer: unknown): Promise<void>;
    /** Puts `value` back locally after a refusal. Skipped when a newer value is already waiting. */
    restore?(repositories: DataRepositories, write: StateWrite<V>, value: V): Promise<void>;
}
