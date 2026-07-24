import { useEffect, useRef } from 'react';

import type { DomainCloud, ICloudRepositoryV2 } from '@chatic/data';
import { getInvitedCloudRegistry, issueCloudDelegationToken, upsertInvitedCloud } from '@chatic/web-core';

import { useRuntimeRepositories } from '../runtime';
import { isNativeApp } from './factories/localFactory';

// One-time flag marking that existing invited clouds were seeded from hot(IndexedDB) into
// cold(SQLite). Kept in localStorage — a store independent of the cache DB — so the bulk seed
// runs only on the first boot after cold activation. See
// libs/app-runtime/docs/data/cold-db-activation-and-invite-recovery.md.
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

/** Rebuild an invited-cloud cache row by re-deriving its endpoints from the relay. */
const recoverFromRelay = async (cloud: ICloudRepositoryV2, cloudId: string, name?: string): Promise<void> => {
    // issueCloudDelegationToken hits the relay and returns backend/wss/cloudId for any cloud the
    // user holds a grant to — the only frontend source of an invited cloud's endpoints once the
    // cache DB is gone. A revoked/expired grant rejects here and the entry is skipped.
    const del = await issueCloudDelegationToken(cloudId);
    await cloud.cacheWrite({
        id: cloudId,
        cid: del.cloudId ?? cloudId,
        name,
        backend: del.backend,
        wss: del.wss,
        cloudType: 'invited',
    });
};

/**
 * Boot reconciliation for invited clouds against the cold DB. Runs once per session on native.
 *
 * 1. Read currently-cached invited clouds (hot-first → hot if present, else cold).
 * 2. Backfill the durable localStorage registry from them (covers users who accepted invites
 *    before the registry existed).
 * 3. One-time seed: re-write them so the cold tier receives them (writes are cold-first). Guarded
 *    by a localStorage flag.
 * 4. Recover registry entries absent from the current list (cache DB wiped, registry survived) by
 *    re-deriving endpoints from the relay.
 */
export const reconcileInvitedCloudsIntoCold = async (cloud: ICloudRepositoryV2): Promise<void> => {
    const result = await cloud.cacheReadList();
    const invited: DomainCloud[] = (result?.list ?? []).filter(c => c.cloudType === 'invited');

    for (const c of invited) {
        if (c.id) upsertInvitedCloud({ cloudId: c.id, name: c.name });
    }

    if (!hasSeeded()) {
        if (invited.length > 0) {
            await cloud.cacheWriteMany(invited);
        }
        markSeeded();
    }

    const presentIds = new Set(invited.map(c => c.id));
    for (const entry of getInvitedCloudRegistry()) {
        if (presentIds.has(entry.cloudId)) continue;
        try {
            await recoverFromRelay(cloud, entry.cloudId, entry.name);
        } catch {
            // Best-effort: skip clouds whose grant is gone.
        }
    }
};

/**
 * Push safety net: when a push names a source cloud that is not in the local cache, re-derive and
 * re-cache it so cross-cloud routing can resolve it. No-op for empty cid or an already-present cloud.
 */
export const recoverInvitedCloudIfMissing = async (
    cloud: ICloudRepositoryV2,
    cloudId: string | undefined,
    name?: string
): Promise<void> => {
    if (!cloudId) return;
    const existing = await cloud.cacheRead(cloudId);
    if (existing) return;
    try {
        await recoverFromRelay(cloud, cloudId, name);
    } catch {
        // Best-effort.
    }
};

/**
 * Mounts the boot reconciliation once. Native WebView only — web/desktop-web have no cold tier.
 */
export const useInvitedCloudColdRecovery = (): void => {
    const { cloud } = useRuntimeRepositories();
    const startedRef = useRef(false);

    useEffect(() => {
        if (!isNativeApp()) return;
        if (startedRef.current) return;
        startedRef.current = true;
        void reconcileInvitedCloudsIntoCold(cloud);
    }, [cloud]);
};
