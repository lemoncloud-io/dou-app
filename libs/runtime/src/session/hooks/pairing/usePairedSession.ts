import { useSyncExternalStore } from 'react';

import { isPairedSession, readSession, subscribeSession } from '@chatic/runtime-client';

export const useIsPairedSession = (): boolean =>
    useSyncExternalStore(subscribeSession, isPairedSession, isPairedSession);

const readCloudIds = (): string[] => readSession().pairing.cloudIds;
const readCloudNames = (): Record<string, string> => readSession().pairing.cloudNames;

export const usePairedCloudIds = (): string[] => useSyncExternalStore(subscribeSession, readCloudIds, readCloudIds);

export const usePairedCloudNames = (): Record<string, string> =>
    useSyncExternalStore(subscribeSession, readCloudNames, readCloudNames);
