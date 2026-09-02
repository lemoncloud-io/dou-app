import { useSyncExternalStore } from 'react';

import { getIdentityContext } from '../../../store';
import { subscribeSessionSignal } from '../../../store';

/**
 * Subscribes to the identity snapshot of the current session.
 */
export const useSessionIdentity = () =>
    useSyncExternalStore(subscribeSessionSignal, getIdentityContext, getIdentityContext);
