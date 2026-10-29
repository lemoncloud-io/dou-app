import { useSyncExternalStore } from 'react';

import { subscribeSessionSignal } from '../../store';
import { pairedClouds } from '../../pairing/pairedClouds';
import { isPairedSession } from '../../pairing/pairedSession';

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
