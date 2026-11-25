import { useSyncExternalStore } from 'react';

import { readConnection, subscribeConnection } from '@chatic/runtime-client';

const readVerified = (): readonly string[] => readConnection().verifiedSlots;

export const useVerifiedClouds = (): readonly string[] =>
    useSyncExternalStore(subscribeConnection, readVerified, readVerified);
