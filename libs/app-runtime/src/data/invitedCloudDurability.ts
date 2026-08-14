import { useEffect, useRef } from 'react';

import type { DomainCloud, ICloudRepositoryV2 } from '@chatic/data';
import { issueCloudDelegationToken, useSessionSelection } from '@chatic/web-core';

import { useRuntimeRepositories, useRuntimeSocketState } from '../runtime';
import { isNativeApp } from './cacheStorageRouting';
import type { CloudDelegationTokenView } from '@lemoncloud/chatic-backend-api';

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
 * Push safety net: when a push names a source cloud that is not in the local cache, re-derive and
 * re-cache it so cross-cloud routing can resolve it. No-op for empty cid or an already-present cloud.
 *
 * The ONLY safety net left for this domain now that the web→native migration bridge is gone
 * (ADR-0053 decision 5). It is reactive — it fires when a push names a cid — so it repairs a
 * specific cloud, never the list. Closing that gap needs a server list API (ADR-0030).
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
