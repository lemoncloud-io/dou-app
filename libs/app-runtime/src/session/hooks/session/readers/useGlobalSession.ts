import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal, getGlobalSessionContext } from '@chatic/session';

/**
 * Subscribes to the assembled global session context.
 */
export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSessionSignal, getGlobalSessionContext, getGlobalSessionContext);
