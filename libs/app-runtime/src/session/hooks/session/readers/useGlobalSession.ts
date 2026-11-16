import { useSyncExternalStore } from 'react';
import { getGlobalSessionContext, subscribeSession } from '../../../sessionReads';

/**
 * Subscribes to the assembled global session context.
 */
export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSession, getGlobalSessionContext, getGlobalSessionContext);
