import { useSyncExternalStore } from 'react';

import { getIdentityContext } from '../../../session/contexts';
import { subscribeSessionSignal } from '../../../session/utils';

/**
 * Subscribes to the identity snapshot of the current session.
 */
export const useSessionIdentity = () =>
    useSyncExternalStore(subscribeSessionSignal, getIdentityContext, getIdentityContext);
