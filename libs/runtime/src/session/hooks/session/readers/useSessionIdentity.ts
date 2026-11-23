import { useSyncExternalStore } from 'react';

import { getIdentityContext, subscribeSession } from '@chatic/runtime-client';

export const useSessionIdentity = () => useSyncExternalStore(subscribeSession, getIdentityContext, getIdentityContext);
