import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import type { ConnectionSnapshot, RuntimeConnection } from '@chatic/runtime-core';
import type { SlotKey, SlotStatus, SocketRequestSample, SocketState } from '@chatic/transport';

import { runtimeEngine } from '../init';

// The sockets as the app reads and drives them, through the engine it was handed — never the socket
// manager. On the phone the sockets may live in another process; the engine is what knows where.

/** The engine's sockets — for the hooks of this package, which read them for React. */
export const runtimeConnection = (): RuntimeConnection => runtimeEngine().connection;

/** The sockets now: the same object until something in it changes. */
export const readConnection = (): ConnectionSnapshot => runtimeConnection().snapshot();

/** Hears every change to the sockets; the listener reads again. */
export const subscribeConnection = (listener: () => void): (() => void) => runtimeConnection().subscribe(listener);

/** The active slot's socket now — for a check made at the moment of a click or a timer, not a render. */
export const getRuntimeSocketState = (): SocketState => readConnection().active;

/**
 * Resolves `true` once `slot` is verified — the active slot when none is named — or `false` when
 * `timeoutMs` passes first. Never rejects. Anything pinned to one slot (`requestOnSlot`) waits on that
 * slot: the active slot is a cloud's whenever a cloud is on screen.
 */
export const waitUntilVerified = (slot?: SlotKey | null, timeoutMs?: number): Promise<boolean> =>
    runtimeConnection().waitUntilVerified(slot ?? null, timeoutMs);

/** A request on one named slot, whichever is active. Throws when that slot is not bound. */
export const requestOnSlot = <T = unknown>(
    slot: SlotKey,
    type: string,
    data?: unknown,
    options?: { timeoutMs?: number }
): Promise<T> => runtimeConnection().requestOnSlot<T>(slot, type, data, options);

/** Hears the server's pushes of one `type`, from one named slot or whichever is active. */
export const onServerEvent = <T = unknown>(
    type: string,
    listener: (message: SocketMessage<T>) => void,
    options?: { slot?: SlotKey }
): (() => void) => runtimeConnection().onServerEvent<T>(type, listener, options);

/** Hears every frame the active slot receives, across reconnects and slot changes. */
export const onServerMessage = (listener: (message: SocketMessage) => void): (() => void) =>
    runtimeConnection().onServerMessage(listener);

/** Hands every settled socket request to `observer` until the returned function stops it. */
export const observeSocketRequests = (observer: (sample: SocketRequestSample) => void): (() => void) =>
    runtimeConnection().observeRequests(observer);

/** Every bound slot's status, relay first — for a debug surface, not for gating anything. */
export const getSlotStatuses = (): Promise<SlotStatus[]> => runtimeConnection().slotStatuses();

/** Closes the active socket so it redials and re-authenticates — a kick for one left half-open. */
export const reconnectSocket = (): Promise<void> => runtimeConnection().reconnect();

/** Recovers the slots that are not verified. */
export const recoverUnverifiedSockets = (): Promise<void> => runtimeConnection().recoverUnverified();

/** Recovers on a return to the foreground: as above, and pings the slots that read verified. */
export const recoverSocketsOnResume = (): Promise<void> => runtimeConnection().recoverOnResume();
