import { useSyncExternalStore } from 'react';

import { getUidInCloud, subscribeSession } from '@chatic/runtime-client';

export const useUidInCloud = (cid: string): string | null =>
    useSyncExternalStore(subscribeSession, () => getUidInCloud(cid));
