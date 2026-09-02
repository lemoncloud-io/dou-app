import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal } from '../../../store';
import { getSessionAuthSnapshot } from '../../../store';

/**
 * Subscribes to the runtime authentication snapshot of the current session.
 */
export const useSessionAuth = () =>
    useSyncExternalStore(subscribeSessionSignal, getSessionAuthSnapshot, getSessionAuthSnapshot);
