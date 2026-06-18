import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal } from '../../../session/utils';
import { getSessionAuthSnapshot } from '../../../session/contextStore';

/**
 * Subscribes to the runtime authentication snapshot of the current session.
 */
export const useSessionAuth = () =>
    useSyncExternalStore(subscribeSessionSignal, getSessionAuthSnapshot, getSessionAuthSnapshot);
