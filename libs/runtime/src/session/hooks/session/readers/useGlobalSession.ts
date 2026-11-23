import { useSyncExternalStore } from 'react';
import { getGlobalSessionContext, subscribeSession } from '@chatic/runtime-client';

export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSession, getGlobalSessionContext, getGlobalSessionContext);
