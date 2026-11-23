import type { runtime } from '@chatic/runtime';

import { deviceStore } from '../../storage';
import { useJoinedCloudsStore } from '../stores/useJoinedCloudsStore';

export const CLOUD_RECORD_OWNER_KEY = 'chatic-cloud-records-owner';

const replaceOwner = (acceptedBy: readonly string[] | undefined, from: string, to: string): string[] | undefined => {
    if (!acceptedBy?.includes(from)) return undefined;
    return [...acceptedBy.filter(id => id !== from && id !== to), to];
};

export const reconcileCloudRecordOwners = async (
    cloud: runtime.data.PageRepositories['cloud'],
    accountId: string
): Promise<void> => {
    const previous = deviceStore.get(CLOUD_RECORD_OWNER_KEY);
    const moveFrom = previous && previous !== accountId ? previous : null;

    const rows = (await cloud.cacheReadList())?.list ?? [];
    for (const row of rows) {
        if (!row.id || row.cloudType !== 'invited') continue;
        const moved = moveFrom ? replaceOwner(row.acceptedBy, moveFrom, accountId) : undefined;
        const acceptedBy = moved ?? (row.acceptedBy?.length ? undefined : [accountId]);
        if (acceptedBy) await cloud.cacheWrite({ id: row.id, cid: row.cid ?? row.id, acceptedBy });
    }
    useJoinedCloudsStore.getState().reconcileOwners(accountId, moveFrom);

    deviceStore.set(CLOUD_RECORD_OWNER_KEY, accountId);
};
