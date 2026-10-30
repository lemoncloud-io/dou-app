import { useSyncExternalStore } from 'react';

import { getIdentityContext, subscribeSessionSignal } from '@chatic/session';

/**
 * Subscribes to the identity snapshot of the current session.
 */
export const useSessionIdentity = () =>
    useSyncExternalStore(subscribeSessionSignal, getIdentityContext, getIdentityContext);
