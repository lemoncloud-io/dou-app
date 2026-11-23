import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import type { ConnectionSnapshot, RuntimeConnection } from '@chatic/runtime-core';
import type { SlotKey, SlotStatus, SocketRequestSample, SocketState } from '@chatic/transport';

import { runtimeEngine } from '../init';

export const runtimeConnection = (): RuntimeConnection => runtimeEngine().connection;

export const readConnection = (): ConnectionSnapshot => runtimeConnection().snapshot();

export const subscribeConnection = (listener: () => void): (() => void) => runtimeConnection().subscribe(listener);

export const getRuntimeSocketState = (): SocketState => readConnection().active;

export const waitUntilVerified = (slot?: SlotKey | null, timeoutMs?: number): Promise<boolean> =>
    runtimeConnection().waitUntilVerified(slot ?? null, timeoutMs);

export const onServerEvent = <T = unknown>(
    type: string,
    listener: (message: SocketMessage<T>) => void,
    options?: { slot?: SlotKey }
): (() => void) => runtimeConnection().onServerEvent<T>(type, listener, options);

export const onServerMessage = (listener: (message: SocketMessage) => void): (() => void) =>
    runtimeConnection().onServerMessage(listener);

export const observeSocketRequests = (observer: (sample: SocketRequestSample) => void): (() => void) =>
    runtimeConnection().observeRequests(observer);

export const getSlotStatuses = (): Promise<SlotStatus[]> => runtimeConnection().slotStatuses();

export const reconnectSocket = (): Promise<void> => runtimeConnection().reconnect();

export const recoverUnverifiedSockets = (): Promise<void> => runtimeConnection().recoverUnverified();

export const recoverSocketsOnResume = (): Promise<void> => runtimeConnection().recoverOnResume();
