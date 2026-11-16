import { useSyncExternalStore } from 'react';

import { isPairedSession, readSession, subscribeSession } from '../../sessionReads';

/** `isPairedSession`, re-read whenever the session or the paired-cloud list moves. */
export const useIsPairedSession = (): boolean =>
    useSyncExternalStore(subscribeSession, isPairedSession, isPairedSession);

// The snapshot keeps each list the same object until it changes, so the hooks hand it out as it is.
const readCloudIds = (): string[] => readSession().pairing.cloudIds;
const readCloudNames = (): Record<string, string> => readSession().pairing.cloudNames;

/** The clouds this guest session entered through a pairing, re-read when the list moves. */
export const usePairedCloudIds = (): string[] => useSyncExternalStore(subscribeSession, readCloudIds, readCloudIds);

/**
 * The names read for the paired clouds, by cloud id (`syncPairedCloudName` writes them). A cloud with
 * no name yet is absent, and the screens name it by its id.
 */
export const usePairedCloudNames = (): Record<string, string> =>
    useSyncExternalStore(subscribeSession, readCloudNames, readCloudNames);
