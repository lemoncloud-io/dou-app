import { pairedClouds } from '@chatic/auth';
import type { DomainCloud, ICloudRepository } from '@chatic/data';

type PairedCloudNames = Pick<typeof pairedClouds, 'has' | 'setName'>;

/**
 * Once inside a cloud this browser entered through a pairing, read its name and keep it beside the
 * paired-cloud list. The approval names only the cloud's id, and the cloud is in neither the owned
 * catalog nor the invited list, so `cloud.get` — which the relay answers for a paired guest with a
 * minimal `{ id, name, status }` view — is the only source of a name.
 *
 * The read skips the cloud cache on purpose. Every row there is classified as owned or invited, and a
 * plain get would create an `owner` row for a cloud the cache has never seen; an `invited` row would
 * make it an invited cloud, with background sockets and unread counts attached. The name goes into
 * the paired-cloud store instead, which drops it with the cloud.
 *
 * Best-effort: a failed read, an empty name or a cloud that is not paired leaves the stored name (or
 * its absence) as it was, and the screens keep their id-based fallback.
 */
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
