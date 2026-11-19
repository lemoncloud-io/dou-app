import { useSyncExternalStore } from 'react';
import { readSession, subscribeSession } from '@chatic/runtime-client';

const readAuth = () => readSession().auth;

/**
 * Subscribes to the runtime authentication snapshot of the current session.
 */
export const useSessionAuth = () => useSyncExternalStore(subscribeSession, readAuth, readAuth);
