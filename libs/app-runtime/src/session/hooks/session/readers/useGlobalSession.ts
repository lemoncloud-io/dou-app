import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal } from '../../../store';
import { getGlobalSessionContext } from '../../../store';

/**
 * Subscribes to the assembled global session context.
 */
export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSessionSignal, getGlobalSessionContext, getGlobalSessionContext);
