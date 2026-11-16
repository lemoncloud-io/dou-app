import type { KeyValueStore } from '@chatic/storage';

import type { StorageLike } from '../jsonSlot';

/**
 * The two kinds of storage the session needs, declared by the session and filled by each app's entry
 * point with whatever store that environment has.
 *
 * - `secret` holds the credentials: the relay token, the cloud delegation and cloud tokens, and the
 *   per-cloud token cache. Whoever holds these signs as the user.
 * - `plain` holds everything else the session keeps: the selection, which uid the account has in each
 *   cloud, the recent and reclaimed clouds, the delegator and device ids, the paired clouds.
 *
 * The split is by what a value would cost if it leaked, not by which store writes it — `relayStore`
 * and `cloudStore` each write both kinds.
 */
export interface SessionStoragePorts {
    secret: KeyValueStore;
    plain: KeyValueStore;
}

export type PortName = keyof SessionStoragePorts;

/** Which store backs each session port, as the entry point configured it. */
export interface ISessionStores {
    /**
     * Points the session at its stores. Called by `createRuntime` with what the entry point passed,
     * before anything reads the session. Assignment, so a second call (HMR) replaces rather than
     * accumulates.
     */
    configure(ports: SessionStoragePorts): void;
    /**
     * The store behind `port` now — for the use cases that sweep a whole port. Throws until
     * `configure` has run: the session has no store of its own to fall back on.
     */
    of(port: PortName): KeyValueStore;
}

/** What a store is built over: one `StorageLike` per port, so a test can hand it two fakes. */
export interface StoragePortPair {
    secret: StorageLike;
    plain: StorageLike;
}

/**
 * One key in one port, and nothing else — what the session hands a writer outside this package, so
 * it can keep its own key without being able to touch the session's others.
 */
export interface IRawSlot {
    read(): string | null;
    write(raw: string): void;
    clear(): void;
}
