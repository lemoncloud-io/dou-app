import { useSyncExternalStore } from 'react';
import { subscribeSessionSignal } from '../../../session/utils';
import { getGlobalSessionContext } from '../../../session/contexts';

/**
 * Subscribes to the assembled global session context.
 */
export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSessionSignal, getGlobalSessionContext, getGlobalSessionContext);
