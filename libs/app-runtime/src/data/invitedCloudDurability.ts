import { useEffect, useRef } from 'react';

import type { DomainCloud, ICloudRepositoryV2 } from '@chatic/data';
import { issueCloudDelegationToken, useSessionSelection } from '@chatic/web-core';

import { useRuntimeRepositories, useRuntimeSocketState } from '../runtime';
import { isNativeApp } from './cacheStorageRouting';
import { createWebInviteCloudStorage } from './factories/localFactory';
import type { CloudDelegationTokenView } from '@lemoncloud/chatic-backend-api';

// One-time flag marking that existing invited clouds were migrated from web(IndexedDB) into the
// native store. Kept in localStorage — a store independent of the cache DB — so the bulk migration
// runs only on the first boot after native stopped reading web storage for this type. See
// libs/app-runtime/docs/data/invite-cloud-durability.md.
//
// The VALUE is frozen: it predates the hot/cold → web/native rename, and changing it would make
// every already-migrated install run the migration again.
const SEED_FLAG_KEY = 'chatic-invitecloud-cold-seeded';

const hasSeeded = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.localStorage.getItem(SEED_FLAG_KEY) === '1';
    } catch {
        return false;
    }
};

const markSeeded = (): void => {
    try {
        window.localStorage.setItem(SEED_FLAG_KEY, '1');
    } catch {
        // localStorage unavailable — the seed simply re-runs next boot (idempotent writes).
    }
};

/**
 * Rebuild an invited-cloud cache row from re-derived endpoints (no name — the name is owned by
 * `syncInvitedCloudName`). `issueCloudDelegationToken` hits the relay and returns backend/wss/cloudId
 * for any cloud the user holds a grant to — the only frontend source of an invited cloud's endpoints
 * once the cache DB is gone. A revoked/expired grant rejects here and the caller skips that cloud.
 */
const rehydrateInvitedCloud = async (cloud: ICloudRepositoryV2, cloudId: string): Promise<void> => {
    const del: CloudDelegationTokenView = await issueCloudDelegationToken(cloudId);
    await cloud.cacheWrite({
        id: cloudId,
        cid: del.cloudId ?? cloudId,
        backend: del.backend,
        wss: del.wss,
        cloudType: 'invited',
    });
};

/**
 * One-time migration of existing invited clouds from web(IndexedDB) into the native store, on the
 * first boot after native stopped reading web storage for this type. Earlier (2-tier) builds kept
 * invited clouds in IndexedDB, and routing now sends invitecloud to the native store — so without
 * this bridge those invited clouds, the only local-only cache type (no server list API), would be
 * stranded; every other type refills from server re-sync. It reads web storage directly (via a
 * dedicated IndexedDB reader, since the repository no longer routes there), filters invited rows,
 * and writes them through the repository. The flag is set only after a successful pass, so a
 * transient failure (web store unreachable, native write error) retries next boot; writes merge by
 * id, so re-running is idempotent.
 */
export const migrateInvitedCloudsIntoNativeStore = async (
    cloud: ICloudRepositoryV2,
    readWebClouds: () => Promise<DomainCloud[]>
): Promise<void> => {
    if (hasSeeded()) return;
    try {
        const webClouds = await readWebClouds();
        const invited: DomainCloud[] = webClouds.filter(c => c.cloudType === 'invited');
        if (invited.length > 0) {
            await cloud.cacheWriteMany(invited);
        }
        markSeeded();
    } catch {
        // Web store unreachable or the native write failed — leave the flag unset so the next boot
        // retries. The migration is idempotent, so a retry is safe.
    }
};

/**
 * Push safety net: when a push names a source cloud that is not in the local cache, re-derive and
 * re-cache it so cross-cloud routing can resolve it. No-op for empty cid or an already-present cloud.
 */
export const recoverInvitedCloudIfMissing = async (
    cloud: ICloudRepositoryV2,
    cloudId: string | undefined
): Promise<void> => {
    if (!cloudId) return;
    const existing = await cloud.cacheRead(cloudId);
    if (existing) return;
    try {
        await rehydrateInvitedCloud(cloud, cloudId);
    } catch {
        // Best-effort.
    }
};

/**
 * Once connected to an invited cloud, fetch its authoritative name over that cloud's socket and
 * persist it. Invited clouds are absent from the relay catalog and the delegation token carries no
 * name, so `cloud.get` is the only source of a fresh name. No-op for a non-invited active cloud or
 * when the name is unchanged.
 */
export const syncInvitedCloudName = async (cloud: ICloudRepositoryV2, cloudId: string | undefined): Promise<void> => {
    if (!cloudId) return;
    const existing = await cloud.cacheRead(cloudId);
    if (existing?.cloudType !== 'invited') return;
    let fresh: DomainCloud | null = null;
    try {
        fresh = await cloud.getCloud({ id: cloudId });
    } catch {
        return; // socket not ready / request failed — best-effort
    }
    const name = fresh?.name;
    if (!name || name === existing.name) return;
    await cloud.cacheWrite({ id: cloudId, cid: existing.cid ?? cloudId, name, cloudType: 'invited' });
};

/**
 * Mounts the boot migration once. Native WebView only — a plain browser already keeps invitecloud
 * in web storage, so there is nothing to move. Reads invited clouds straight from IndexedDB so the
 * native store can be seeded with rows a prior 2-tier build left behind there.
 */
export const useInvitedCloudMigration = (): void => {
    const { cloud } = useRuntimeRepositories();
    const startedRef = useRef(false);

    useEffect(() => {
        if (!isNativeApp()) return;
        if (startedRef.current) return;
        startedRef.current = true;
        // Build the web reader lazily inside the thunk so a construction failure (e.g. no IndexedDB
        // in this WebView) is caught by the migration's own retry guard rather than the effect.
        void migrateInvitedCloudsIntoNativeStore(cloud, () => createWebInviteCloudStorage().loadAll());
    }, [cloud]);
};

/**
 * Syncs the active invited cloud's authoritative name once its socket is verified. Runs once per
 * verified cloud. Native WebView only.
 */
export const useInvitedCloudNameSync = (): void => {
    const { cloud } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const { selectedCloudId } = useSessionSelection();
    const syncedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isNativeApp()) return;
        if (!isVerified || !selectedCloudId) return;
        if (syncedRef.current === selectedCloudId) return;
        syncedRef.current = selectedCloudId;
        void syncInvitedCloudName(cloud, selectedCloudId);
    }, [cloud, isVerified, selectedCloudId]);
};
