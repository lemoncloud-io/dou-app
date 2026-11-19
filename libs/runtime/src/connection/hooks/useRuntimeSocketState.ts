import { useSyncExternalStore } from 'react';

import type { SocketState } from '@chatic/runtime-client';

import { readConnection, subscribeConnection } from '@chatic/runtime-client';

const readActive = (): SocketState => readConnection().active;

/** The active slot's socket — the one the session is on — through the engine. */
export const useRuntimeSocketState = (): SocketState =>
    useSyncExternalStore(subscribeConnection, readActive, readActive);
