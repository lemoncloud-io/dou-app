import { useSyncExternalStore } from 'react';

import { getIdentityContext, subscribeSession } from '../../../sessionReads';

/**
 * Subscribes to the identity snapshot of the current session.
 */
export const useSessionIdentity = () => useSyncExternalStore(subscribeSession, getIdentityContext, getIdentityContext);
