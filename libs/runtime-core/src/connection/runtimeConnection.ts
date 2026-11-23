import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import { recoverSocketsOnResume, recoverUnverifiedSockets, reclaimOwnedClouds } from '@chatic/auth';
import { sessionSignal } from '@chatic/session';
import { backgroundClouds, getSocketManager, readOnline, subscribeOnline } from '@chatic/transport';
import type { SlotKey, SlotStatus, SocketRequestSample, SocketState } from '@chatic/transport';

export interface ConnectionSnapshot {
    active: SocketState;
    verifiedSlots: readonly string[];
    online: boolean;
}

export interface RuntimeConnection {
    snapshot(): ConnectionSnapshot;
    subscribe(listener: () => void): () => void;

    waitUntilVerified(slot?: SlotKey | null, timeoutMs?: number): Promise<boolean>;
    requestOnSlot<T = unknown>(
        slot: SlotKey,
        type: string,
        data?: unknown,
        options?: { timeoutMs?: number }
    ): Promise<T>;
    onServerEvent<T = unknown>(
        type: string,
        listener: (message: SocketMessage<T>) => void,
        options?: { slot?: SlotKey }
    ): () => void;
    onServerMessage(listener: (message: SocketMessage) => void): () => void;
    observeRequests(observer: (sample: SocketRequestSample) => void): () => void;
    slotStatuses(): Promise<SlotStatus[]>;

    reconnect(): Promise<void>;
    recoverUnverified(): Promise<void>;
    recoverOnResume(): Promise<void>;

    setBackgroundClouds(cloudIds: readonly string[]): void;
    setOwnedClouds(ownedCloudIds: readonly string[], alsoInvitedCloudIds: readonly string[]): void;
}

const SEPARATOR = '\n';

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
        const online = readOnline();
        if (current && current.active === active && key === verifiedKey && current.online === online) return current;
        const verifiedSlots = current && key === verifiedKey ? current.verifiedSlots : key ? key.split(SEPARATOR) : [];
        verifiedKey = key;
        const next: ConnectionSnapshot = { active, verifiedSlots, online };
        current = next;
        return next;
    };

    const listeners = new Set<() => void>();
    let detachUpstream: (() => void) | null = null;
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };

    const attachUpstream = (): (() => void) => {
        const manager = getSocketManager();
        const unsubscribeActive = manager.subscribe(() => notify());
        const unsubscribeOnline = subscribeOnline(() => notify());
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
            void Promise.resolve().then(notify);
        });
        return () => {
            unsubscribeActive();
            unsubscribeOnline();
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
