import { useSyncExternalStore } from 'react';
import { getGlobalSessionContext, subscribeSession } from '@chatic/runtime-client';

/**
 * Subscribes to the assembled global session context.
 */
export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSession, getGlobalSessionContext, getGlobalSessionContext);
