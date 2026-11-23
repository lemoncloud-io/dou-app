import { syncInvitedCloudName, syncPairedCloudName } from './dataCommands';

export interface CloudNameSyncPass {
    cloudId: string | null | undefined;
    ready: boolean;
}

export const createInvitedCloudNameSync = (): ((pass: CloudNameSyncPass) => void) => {
    let synced: string | null = null;
    return ({ cloudId, ready }) => {
        if (!ready || !cloudId) return;
        if (synced === cloudId) return;
        synced = cloudId;
        void syncInvitedCloudName(cloudId);
    };
};

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
