import { useSyncExternalStore } from 'react';
import { readSession, subscribeSession } from '@chatic/runtime-client';

const readAuth = () => readSession().auth;

export const useSessionAuth = () => useSyncExternalStore(subscribeSession, readAuth, readAuth);
