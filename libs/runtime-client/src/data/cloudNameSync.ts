import { syncInvitedCloudName, syncPairedCloudName } from './dataCommands';

/** What a cloud-name sync is told on each pass: the selected cloud and whether its read can run now. */
export interface CloudNameSyncPass {
    cloudId: string | null | undefined;
    /** The active slot and the relay slot are both verified — the name is read from the relay. */
    ready: boolean;
}

/**
 * The invited-cloud name sync: reads the selected invited cloud's authoritative name once its socket
 * and the relay are verified, once per cloud for as long as the returned function is kept — the run is
 * spent once it starts. The caller decides whether this page should run it at all (the phone app only)
 * and keeps one per mount.
 */
export const createInvitedCloudNameSync = (): ((pass: CloudNameSyncPass) => void) => {
    let synced: string | null = null;
    return ({ cloudId, ready }) => {
        if (!ready || !cloudId) return;
        if (synced === cloudId) return;
        synced = cloudId;
        void syncInvitedCloudName(cloudId);
    };
};

/**
 * The paired-cloud name sync: reads the selected cloud's name once per entry while it is a paired
 * cloud. Leaving the cloud, or its pairing ending, closes the entry, so the next entry reads again — a
 * failed read retries there rather than in a loop, and a re-paired cloud gets its name back.
 */
export const createPairedCloudNameSync = (): ((pass: CloudNameSyncPass & { isPaired: boolean }) => void) => {
    let synced: string | null = null;
    return ({ cloudId, ready, isPaired }) => {
        if (!isPaired || !cloudId) {
            synced = null;
            return;
        }
        if (!ready) return;
        if (synced === cloudId) return;
        synced = cloudId;
        void syncPairedCloudName(cloudId);
    };
};
