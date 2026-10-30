import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal, getSessionAuthSnapshot } from '@chatic/session';

/**
 * Subscribes to the runtime authentication snapshot of the current session.
 */
export const useSessionAuth = () =>
    useSyncExternalStore(subscribeSessionSignal, getSessionAuthSnapshot, getSessionAuthSnapshot);
