import { useSyncExternalStore } from 'react';

import { getIdentityContext, subscribeSession } from '@chatic/runtime-client';

/**
 * Subscribes to the identity snapshot of the current session.
 */
export const useSessionIdentity = () => useSyncExternalStore(subscribeSession, getIdentityContext, getIdentityContext);
