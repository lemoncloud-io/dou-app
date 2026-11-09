import { useSyncExternalStore } from 'react';

import { subscribeSessionSignal } from '@chatic/session';
import { pairedClouds, isPairedSession } from '@chatic/auth';

const subscribe = (listener: () => void): (() => void) => {
    const offSession = subscribeSessionSignal(listener);
    const offClouds = pairedClouds.subscribe(listener);
    return () => {
        offSession();
        offClouds();
    };
};

/** `isPairedSession`, re-read whenever the session or the paired-cloud list moves. */
export const useIsPairedSession = (): boolean => useSyncExternalStore(subscribe, isPairedSession, isPairedSession);

const listClouds = (): string => JSON.stringify(pairedClouds.list());

/** The clouds this guest session entered through a pairing, re-read when the list moves. */
export const usePairedCloudIds = (): string[] => {
    // Compared as a string: the list is rebuilt on every read, and a snapshot must be stable.
    const snapshot = useSyncExternalStore(pairedClouds.subscribe, listClouds, listClouds);
    return JSON.parse(snapshot) as string[];
};

const listNames = (): string => JSON.stringify(pairedClouds.names());

/**
 * The names read for the paired clouds, by cloud id (`syncPairedCloudName` writes them). A cloud with
 * no name yet is absent, and the screens name it by its id.
 */
export const usePairedCloudNames = (): Record<string, string> => {
    // Compared as a string for the same reason as the list.
    const snapshot = useSyncExternalStore(pairedClouds.subscribeNames, listNames, listNames);
    return JSON.parse(snapshot) as Record<string, string>;
};
