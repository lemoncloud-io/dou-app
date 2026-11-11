import { useSyncExternalStore } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import type { ActiveCloudData, OtherCloudUnread } from '../../../hooks';

/** The two screens that show a channel's messages. Their routes are exclusive: one is open at a time. */
export type DebugRoomSurface = 'room' | 'thread';

/**
 * What the open room or thread holds right now, as the screen itself holds it. `rendered` is the
 * list the bubbles are drawn from; `rows` is the feed window before the room filters it (reaction
 * events, replies and hidden rows included), because a message that never shows is exactly the one
 * someone is chasing.
 */
export interface DebugRoomObservation {
    surface: DebugRoomSurface;
    channelId: string;
    channel: DomainChannel | null;
    rendered: readonly DomainChat[];
    rows: readonly DomainChat[];
}

/**
 * The message last long-pressed, kept after its action sheet closes. It names the surface and
 * channel it came from, so a room that moved on to another channel does not inherit it.
 */
export interface DebugRoomFocus {
    surface: DebugRoomSurface;
    channelId: string;
    messageId: string;
}

/**
 * The app's shared observations, mirrored out of the React tree for the overlay to read.
 *
 * WHY a store and not the contexts directly: `DebugOverlayHost` is mounted at the `app.tsx` level,
 * OUTSIDE `AppRuntime`, on purpose — it has to stay reachable while the runtime is still gating its
 * subtree (a boot hang is exactly when the overlay earns its keep). That also puts it outside
 * `ActiveCloudDataProvider` / `OtherCloudUnreadProvider`, so a tab that calls `useActiveCloudData()`
 * throws "provider is missing" and, being inside the app-wide error boundary, takes the whole UI
 * down with it.
 *
 * Mirroring keeps both properties: the overlay stays out of tree, and the numbers it shows are still
 * the SAME objects the badge and home read — not a second observation, which would hide the very bug
 * the inspector exists to find. `DebugObservationReporter` publishes the two cloud slots from inside
 * the providers, and the room and thread pages publish the room slots (`useDebugRoomMirror`) — all
 * only while debug mode is unlocked; with them absent the slots stay null and screens say so.
 */
export interface DebugSharedObservation {
    /** The active cloud's channels / my joins / unread aggregation. Null = not published yet. */
    activeCloud: ActiveCloudData | null;
    /** The inactive clouds' cached unread. Null = not published yet. */
    otherCloud: OtherCloudUnread | null;
    /** The open room or thread, published by that page itself. Null = neither is open. */
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

/**
 * Replaces the published slots. Called on every re-render of the provider subtree the reporter sits
 * in, and of an open room, so it stays a plain assignment — the identity check keeps a re-render
 * that changed no slot from waking the subscribed screens.
 */
export const publishDebugObservation = (next: Partial<DebugSharedObservation>) => {
    const merged = { ...observation, ...next };
    const keys = Object.keys(merged) as (keyof DebugSharedObservation)[];
    if (keys.every(key => merged[key] === observation[key])) return;
    observation = merged;
    listeners.forEach(listener => listener());
};

/** Resets every slot. Each publisher clears its own slots instead; tests use this between cases. */
export const clearDebugObservation = () => {
    publishDebugObservation(EMPTY_OBSERVATION);
};

export const useDebugObservation = (): DebugSharedObservation =>
    useSyncExternalStore(subscribeDebugObservation, getDebugObservation);
