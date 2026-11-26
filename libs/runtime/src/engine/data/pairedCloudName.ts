import { pairedClouds } from '@chatic/auth';
import type { DomainCloud, ICloudRepository } from '@chatic/data';

type PairedCloudNames = Pick<typeof pairedClouds, 'has' | 'setName'>;

export const syncPairedCloudName = async (
    cloud: Pick<ICloudRepository, 'getCloud'>,
    cloudId: string | undefined,
    store: PairedCloudNames = pairedClouds
): Promise<void> => {
    if (!cloudId || !store.has(cloudId)) return;
    let fresh: DomainCloud | null = null;
    try {
        fresh = await cloud.getCloud({ id: cloudId }, { cache: false });
    } catch {
        return;
    }
    if (fresh?.name) store.setName(cloudId, fresh.name);
};
