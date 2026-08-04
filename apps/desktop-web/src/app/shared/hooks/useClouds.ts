import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainCloud } from '@chatic/data';
import { useCloudSessionCatalog, useGlobalSession } from '@chatic/web-core';

import { useJoinedCloudsStore } from '../stores';

/** Minimal cloud shape the rail needs (id guaranteed present). */
export interface RailCloud {
    id: string;
    name?: string;
    status?: string;
    /** 'home' = Default/relay, 'owned' = broker-delegable, 'invited' = invite-joined. */
    kind: 'home' | 'owned' | 'invited';
}

/**
 * Cloud list + currently-active cloud id for the cloud rail. The active id is derived from the
 * global session (`cloud.cloudId`); when the relay catalog has settled empty it falls back to
 * 'default' so the synthesized Home workspace highlights in relay mode.
 *
 * Invited clouds are absent from the relay catalog by design (there is no server-side list for
 * them), so their durable record is the local `invitecloud` cache row written by the invite-accept
 * flow — the same row apps/web reads in `useInvitedClouds`. The joined-clouds store is only a
 * fast path for a just-joined cloud (and the sole carrier of its name); it lives in this profile's
 * localStorage, so reading it alone hid every invited cloud joined on another profile — including
 * the one the session was inside (.claude/20260804/DEBUG-14-50-00.md).
 */
export const useClouds = () => {
    const { clouds: rawClouds, isFetchingClouds } = useCloudSessionCatalog();
    const { cloud: cloudRepository } = useRuntimeRepositories();
    const joinedClouds = useJoinedCloudsStore(s => s.joinedClouds);
    const session = useGlobalSession();
    const [cachedClouds, setCachedClouds] = useState<DomainCloud[]>([]);
    // Fall back to 'default' so the synthesized Home workspace highlights in relay mode —
    // but only once the fetch settled, to avoid briefly highlighting it then un-highlighting.
    const activeCloudId = session.cloud.cloudId || (!isFetchingClouds && rawClouds.length === 0 ? 'default' : null);

    useEffect(() => cloudRepository.observeList(result => setCachedClouds(result?.list ?? [])), [cloudRepository]);

    const clouds = useMemo<RailCloud[]>(() => {
        const byId = new Map<string, RailCloud>();
        for (const c of rawClouds) {
            if (c.id && c.id !== 'default') {
                byId.set(c.id, { id: c.id, name: c.name, status: c.status as string | undefined, kind: 'owned' });
            }
        }
        // Invited clouds, restored from their durable cache row. Owned entries win — the same cloud
        // can be cached as invited and later show up owned once signed in as its owner.
        for (const c of cachedClouds) {
            if (c.cloudType === 'invited' && c.id && c.id !== 'default' && !byId.has(c.id)) {
                byId.set(c.id, { id: c.id, name: c.name, status: 'active', kind: 'invited' });
            }
        }
        // Merge invite-joined clouds the broker list hasn't returned yet (eventual
        // consistency), so a just-joined cloud shows in the rail immediately. It also carries the
        // cloud's name, which the cache row does not — fill that in rather than shadowing it.
        for (const j of Object.values(joinedClouds)) {
            const existing = byId.get(j.id);
            if (existing) existing.name = existing.name ?? j.name;
            else if (j.id !== 'default') byId.set(j.id, { id: j.id, name: j.name, status: 'active', kind: 'invited' });
        }
        // The cloud the session is inside always gets a tile, even when neither source lists it —
        // its channels are on screen, so a rail without it reads as "my cloud disappeared" and
        // leaves no tile for the active highlight to land on. Name unknown here; the tile falls
        // back to the id's initial.
        if (activeCloudId && activeCloudId !== 'default' && !byId.has(activeCloudId)) {
            byId.set(activeCloudId, { id: activeCloudId, status: 'active', kind: 'invited' });
        }
        // The Default Cloud ('Home') is always the first rail entry — it's the Guest
        // Session's Self Channel and the return path from any joined cloud.
        const home: RailCloud = { id: 'default', name: 'Home', status: 'active', kind: 'home' };
        return [home, ...byId.values()];
    }, [rawClouds, cachedClouds, joinedClouds, activeCloudId]);

    return { clouds, activeCloudId, isFetchingClouds };
};
