import type { DomainJoin } from '@chatic/data-model';

export interface OutboxValues {
    'join.read': number;
    'join.notify': DomainJoin['notify'];
    'join.nick': string;
}

export type OutboxOp = keyof OutboxValues;

export interface StateWrite<V = unknown> {
    op: OutboxOp;
    cid: string;
    uid: string;
    key: string;
    value: V;
    previous?: V;
}

export class OutboxRefusalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OutboxRefusalError';
    }
}

export interface WriteReceipt {
    delivered: Promise<void>;
}

export interface OutboxPort {
    set<V>(write: StateWrite<V>): WriteReceipt;
}

export interface OutboxTransport<R = unknown> {
    watchReady(cid: string, listener: (ready: boolean) => void): () => void;
    inCloud<T>(cid: string, work: (repositories: R) => Promise<T>): Promise<T>;
    uidOf(cid: string): string | null;
    isRefusal(error: unknown): boolean;
    retryDelaysMs: readonly number[];
    setTimer(callback: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
}

export interface StateSpec<V, R = unknown> {
    op: OutboxOp;
    merge?(waiting: V, next: V): V;
    isCovered?(accepted: V, next: V): boolean;
    deliver(repositories: R, write: StateWrite<V>): Promise<unknown>;
    accept?(repositories: R, write: StateWrite<V>, answer: unknown): Promise<void>;
    restore?(repositories: R, write: StateWrite<V>, value: V): Promise<void>;
}

export type OutboxSettleOutcome = 'accepted' | 'refused' | 'account_changed';

export interface OutboxDelivery {
    op: OutboxOp;
    cid: string;
    outcome: OutboxSettleOutcome;
    deliveryMs: number;
    waitSocketMs: number;
    attempts: number;
}

export interface OutboxObserver {
    now(): number;
    begin(): ((delivery: OutboxDelivery) => void) | undefined;
}
