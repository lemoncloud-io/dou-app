import { useSyncExternalStore } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/runtime';

import type { ActiveCloudData, OtherCloudUnread } from '../../../hooks';

export type DebugRoomSurface = 'room' | 'thread';

export interface DebugRoomObservation {
    surface: DebugRoomSurface;
    channelId: string;
    channel: DomainChannel | null;
    rendered: readonly DomainChat[];
    rows: readonly DomainChat[];
}

export interface DebugRoomFocus {
    surface: DebugRoomSurface;
    channelId: string;
    messageId: string;
}

export interface DebugSharedObservation {
    activeCloud: ActiveCloudData | null;
    otherCloud: OtherCloudUnread | null;
    room: DebugRoomObservation | null;
    roomFocus: DebugRoomFocus | null;
}

const EMPTY_OBSERVATION: DebugSharedObservation = {
    activeCloud: null,
    otherCloud: null,
    room: null,
    roomFocus: null,
};

let observation: DebugSharedObservation = EMPTY_OBSERVATION;
const listeners = new Set<() => void>();

export const getDebugObservation = (): DebugSharedObservation => observation;

export const subscribeDebugObservation = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const publishDebugObservation = (next: Partial<DebugSharedObservation>) => {
    const merged = { ...observation, ...next };
    const keys = Object.keys(merged) as (keyof DebugSharedObservation)[];
    if (keys.every(key => merged[key] === observation[key])) return;
    observation = merged;
    listeners.forEach(listener => listener());
};

export const clearDebugObservation = () => {
    publishDebugObservation(EMPTY_OBSERVATION);
};

export const useDebugObservation = (): DebugSharedObservation =>
    useSyncExternalStore(subscribeDebugObservation, getDebugObservation);
