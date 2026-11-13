import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import { recoverSocketsOnResume, recoverUnverifiedSockets, reclaimOwnedClouds } from '@chatic/auth';
import { sessionSignal } from '@chatic/session';
import { backgroundClouds, getSocketManager } from '@chatic/transport';
import type { SlotKey, SlotStatus, SocketRequestSample, SocketState } from '@chatic/transport';

/** The sockets as screens read them. Plain data: on the phone it is mirrored from another process. */
export interface ConnectionSnapshot {
    /** The active slot's socket — the one the session is on. */
    active: SocketState;
    /** Every bound slot that is verified now, the relay among them, in slot order. */
    verifiedSlots: readonly string[];
}

/**
 * The runtime's sockets, as the React surface reads and drives them — never the socket manager itself.
 * On the phone the sockets may live in another process; whatever crosses is plain data, and a
 * subscription is a stream rather than a handle on a client.
 */
export interface RuntimeConnection {
    /** The sockets now: the same object until something in it changes. */
    snapshot(): ConnectionSnapshot;
    /** Hears every change to the snapshot; the listener reads again. */
    subscribe(listener: () => void): () => void;

    /**
     * Resolves `true` once `slot` is verified — the active slot when none is named — or `false` when
     * `timeoutMs` passes first. Never rejects.
     */
    waitUntilVerified(slot?: SlotKey | null, timeoutMs?: number): Promise<boolean>;
    /**
     * A request on one named slot, whichever slot is active — for work that belongs to one server.
     * Throws when that slot is not bound. Not on the React surface: the relay account's profile, its
     * one use there, is the session commands `fetchAccountProfile` / `updateAccountProfile`.
     *
     * It does not cross the bridge: a request of any type is not a domain result. It works only where
     * the runtime runs in the page's own process.
     */
    requestOnSlot<T = unknown>(
        slot: SlotKey,
        type: string,
        data?: unknown,
        options?: { timeoutMs?: number }
    ): Promise<T>;
    /**
     * Hears the server's pushes of one `type` — from one named slot when `slot` is given, whichever
     * slot is active otherwise. Stands across slot rebuilds and before the slot exists.
     */
    onServerEvent<T = unknown>(
        type: string,
        listener: (message: SocketMessage<T>) => void,
        options?: { slot?: SlotKey }
    ): () => void;
    /**
     * Hears every frame the active slot receives, across reconnects and slot changes. Like
     * `requestOnSlot`, it does not cross the bridge: raw frames are not domain results.
     */
    onServerMessage(listener: (message: SocketMessage) => void): () => void;
    /**
     * Hands every settled request to `observer` until the returned function stops it. One observer at
     * a time: a newer one replaces it, and stopping a replaced one leaves the newer in place.
     */
    observeRequests(observer: (sample: SocketRequestSample) => void): () => void;
    /** Every bound slot's status, relay first — for a debug surface, not for gating anything. */
    slotStatuses(): Promise<SlotStatus[]>;

    /** Closes the active socket so it redials and re-authenticates — a kick for one left half-open. */
    reconnect(): Promise<void>;
    /** Recovers the slots that are not verified. */
    recoverUnverified(): Promise<void>;
    /** Recovers on a return to the foreground: as above, and pings the slots that read verified. */
    recoverOnResume(): Promise<void>;

    /**
     * The clouds the account belongs to, which keep a socket session in the background. The runtime
     * leaves out the relay and the committed cloud, orders by recent use and caps the list.
     */
    setBackgroundClouds(cloudIds: readonly string[]): void;
    /**
     * The clouds the account owns, and those of them this device has also cached as invited clouds.
     * One held as an invitee is re-issued as the owner — now, and again whenever a cloud token is
     * committed, since an invite entry can be committed after the list arrived.
     */
    setOwnedClouds(ownedCloudIds: readonly string[], alsoInvitedCloudIds: readonly string[]): void;
}

const SEPARATOR = '\n';

/**
 * The core runtime's sockets: this process's socket manager, read and driven here.
 *
 * The snapshot keeps its parts' identity until they change — `active` is the manager's own snapshot,
 * which it replaces on a change, and the verified slots are rebuilt only when the set differs — so
 * `useSyncExternalStore` re-renders only on a real change.
 */
export const createCoreRuntimeConnection = (): RuntimeConnection => {
    let current: ConnectionSnapshot | null = null;
    let verifiedKey = '';

    const readVerifiedKey = (): string => {
        const manager = getSocketManager();
        return manager
            .getSlotKeys()
            .filter(key => manager.isSlotVerified(key))
            .join(SEPARATOR);
    };

    const snapshot = (): ConnectionSnapshot => {
        const active = getSocketManager().getSnapshot();
        const key = readVerifiedKey();
        if (current && current.active === active && key === verifiedKey) return current;
        const verifiedSlots = current && key === verifiedKey ? current.verifiedSlots : key ? key.split(SEPARATOR) : [];
        verifiedKey = key;
        const next: ConnectionSnapshot = { active, verifiedSlots };
        current = next;
        return next;
    };

    // One upstream subscription for every subscriber: dozens of components read the sockets, and a
    // socket event should cost one pass over the manager, not one per reader. Attached with the first
    // subscriber and let go with the last.
    const listeners = new Set<() => void>();
    let detachUpstream: (() => void) | null = null;
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };

    const attachUpstream = (): (() => void) => {
        const manager = getSocketManager();
        const unsubscribeActive = manager.subscribe(() => notify());
        // One verified subscription per bound slot, re-made as slots bind and go: a slot that appears
        // after subscribing has no subscription until the client listener adds one.
        const perSlot = new Map<SlotKey, () => void>();
        const unsubscribeClients = manager.subscribeSlotClients((key, client) => {
            perSlot.get(key)?.();
            perSlot.delete(key);
            if (client) {
                perSlot.set(
                    key,
                    manager.subscribeSlotVerified(key, () => notify())
                );
                notify();
                return;
            }
            // A teardown is announced while the slot is still bound, and nothing is announced once it
            // is gone, so the set has to be re-read after the teardown finishes.
            void Promise.resolve().then(notify);
        });
        return () => {
            unsubscribeActive();
            unsubscribeClients();
            for (const unsubscribe of perSlot.values()) unsubscribe();
            perSlot.clear();
        };
    };

    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener);
        if (!detachUpstream) detachUpstream = attachUpstream();
        return () => {
            if (!listeners.delete(listener) || listeners.size > 0) return;
            detachUpstream?.();
            detachUpstream = null;
        };
    };

    let owned: { ownedCloudIds: readonly string[]; alsoInvitedCloudIds: readonly string[] } = {
        ownedCloudIds: [],
        alsoInvitedCloudIds: [],
    };
    let ownedKey = '';
    let requestObserver: ((sample: SocketRequestSample) => void) | undefined;
    let stopReclaimOnCommit: (() => void) | null = null;
    // Never throws: each renewal reports its own failure.
    const reclaim = (): void => {
        if (owned.ownedCloudIds.length) void reclaimOwnedClouds(owned.ownedCloudIds, owned.alsoInvitedCloudIds);
    };

    return {
        snapshot,
        subscribe,

        waitUntilVerified: (slot, timeoutMs) =>
            slot
                ? getSocketManager().waitUntilSlotVerified(slot, timeoutMs)
                : getSocketManager().waitUntilVerified(timeoutMs),
        requestOnSlot: (slot, type, data, options) =>
            getSocketManager()
                .getScopedClient(slot)
                .request(type, data, options ?? undefined),
        onServerEvent: (type, listener, options) =>
            options?.slot
                ? getSocketManager().onSlotType(options.slot, type, listener)
                : getSocketManager().onType(type, listener),
        onServerMessage: listener => {
            const manager = getSocketManager();
            // `onMessage` needs a live client and does not survive a rebind, so attach it whenever the
            // active client changes.
            let detach: (() => void) | undefined;
            const unsubscribeClient = manager.subscribeClient(client => {
                detach?.();
                detach = undefined;
                if (!client) return;
                detach = manager.onMessage(({ message }) => listener(message as SocketMessage));
            });
            return () => {
                detach?.();
                unsubscribeClient();
            };
        },
        observeRequests: observer => {
            requestObserver = observer;
            getSocketManager().setRequestObserver(observer);
            return () => {
                if (requestObserver !== observer) return;
                requestObserver = undefined;
                getSocketManager().setRequestObserver(undefined);
            };
        },
        slotStatuses: async () => getSocketManager().getSlotStatuses(),

        reconnect: () => getSocketManager().disconnect(),
        recoverUnverified: () => recoverUnverifiedSockets(),
        recoverOnResume: () => recoverSocketsOnResume(),

        setBackgroundClouds: cloudIds => backgroundClouds.setJoined([...cloudIds]),
        setOwnedClouds: (ownedCloudIds, alsoInvitedCloudIds) => {
            const key = `${ownedCloudIds.join(SEPARATOR)}|${alsoInvitedCloudIds.join(SEPARATOR)}`;
            owned = { ownedCloudIds: [...ownedCloudIds], alsoInvitedCloudIds: [...alsoInvitedCloudIds] };
            if (!stopReclaimOnCommit) stopReclaimOnCommit = sessionSignal.subscribe(['cloud:token'], reclaim);
            if (key === ownedKey) return;
            ownedKey = key;
            reclaim();
        },
    };
};
