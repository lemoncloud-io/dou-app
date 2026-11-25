import { useSyncExternalStore } from 'react';

import type { SocketState } from '@chatic/runtime-client';

import { readConnection, subscribeConnection } from '@chatic/runtime-client';

const readActive = (): SocketState => readConnection().active;

export const useRuntimeSocketState = (): SocketState =>
    useSyncExternalStore(subscribeConnection, readActive, readActive);
