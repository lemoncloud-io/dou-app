import { RELAY_CLOUD_ID, type DomainCloud, type ICloudRepository } from '@chatic/data';

import { getAcceptorId, withAcceptor } from './invitedCloudAcceptance';
import { getRepositories } from './runtime';
import type { CloudDelegationTokenView } from '@lemoncloud/chatic-backend-api';

const rehydrateInvitedCloud = async (cloud: ICloudRepository, cloudId: string): Promise<void> => {
    const del: CloudDelegationTokenView = await getRepositories().auth.delegateCloud(cloudId);
    const existing = await cloud.cacheRead(cloudId);
    await cloud.cacheWrite({
        id: cloudId,
        cid: del.cloudId ?? cloudId,
        backend: del.backend,
        wss: del.wss,
        cloudType: 'invited',
        acceptedBy: withAcceptor(existing?.acceptedBy, getAcceptorId()),
    });
};

export const recoverInvitedCloudIfMissing = async (
    cloud: ICloudRepository,
    cloudId: string | undefined
): Promise<void> => {
    if (!cloudId || cloudId === RELAY_CLOUD_ID) return;
    const existing = await cloud.cacheRead(cloudId);
    if (existing) return;
    try {
        await rehydrateInvitedCloud(cloud, cloudId);
    } catch {
        // Best-effort.
    }
};

export const syncInvitedCloudName = async (cloud: ICloudRepository, cloudId: string | undefined): Promise<void> => {
    if (!cloudId) return;
    const existing = await cloud.cacheRead(cloudId);
    if (existing?.cloudType !== 'invited') return;
    let fresh: DomainCloud | null = null;
    try {
        fresh = await cloud.getCloud({ id: cloudId });
    } catch {
        return;
    }
    const name = fresh?.name;
    if (!name || name === existing.name) return;
    await cloud.cacheWrite({ id: cloudId, cid: existing.cid ?? cloudId, name, cloudType: 'invited' });
};
