import { useSyncExternalStore } from 'react';

import type { ActiveCloudData, OtherCloudUnread } from '../../../hooks';

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
 * the inspector exists to find. `DebugObservationReporter` publishes from inside the providers, and
 * only while debug mode is unlocked; with it absent the slots stay null and tabs say so.
 */
export interface DebugSharedObservation {
    /** The active cloud's channels / my joins / unread aggregation. Null = not published yet. */
    activeCloud: ActiveCloudData | null;
    /** The inactive clouds' cached unread. Null = not published yet. */
    otherCloud: OtherCloudUnread | null;
}

const EMPTY_OBSERVATION: DebugSharedObservation = { activeCloud: null, otherCloud: null };

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
 * in, so it stays a plain assignment — the identity check keeps a re-render that changed neither
 * slot from waking the subscribed tabs.
 */
export const publishDebugObservation = (next: Partial<DebugSharedObservation>) => {
    const merged = { ...observation, ...next };
    if (merged.activeCloud === observation.activeCloud && merged.otherCloud === observation.otherCloud) return;
    observation = merged;
    listeners.forEach(listener => listener());
};

/** Drops the mirror when the reporter unmounts, so a later open cannot read a dead snapshot. */
export const clearDebugObservation = () => {
    publishDebugObservation(EMPTY_OBSERVATION);
};

export const useDebugObservation = (): DebugSharedObservation =>
    useSyncExternalStore(subscribeDebugObservation, getDebugObservation);
