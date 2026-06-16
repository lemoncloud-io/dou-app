import { useMemo } from 'react';

import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';

import { useCloudSession } from '@chatic/app-runtime';

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
 * Cloud list + currently-active cloud id for the cloud rail. The active id
 * prefers the live socket store and falls back to persisted selection so the
 * rail highlights correctly before the socket reports a cloud.
 */
export const useClouds = () => {
    const { clouds: rawClouds, isFetchingClouds } = useCloudSession();
    const joinedClouds = useJoinedCloudsStore(s => s.joinedClouds);
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    // Fall back to 'default' so the synthesized Home workspace highlights in relay mode —
    // but only once the fetch settled, to avoid briefly highlighting it then un-highlighting.
    const activeCloudId =
        storeCloudId ||
        cloudCore.getSelectedCloudId() ||
        (!isFetchingClouds && rawClouds.length === 0 ? 'default' : null);

    const clouds = useMemo<RailCloud[]>(() => {
        const byId = new Map<string, RailCloud>();
        for (const c of rawClouds) {
            if (c.id && c.id !== 'default') {
                byId.set(c.id, { id: c.id, name: c.name, status: c.status as string | undefined, kind: 'owned' });
            }
        }
        // Merge invite-joined clouds the broker list hasn't returned yet (eventual
        // consistency), so a just-joined cloud shows in the rail immediately.
        for (const j of Object.values(joinedClouds)) {
            if (j.id !== 'default' && !byId.has(j.id))
                {byId.set(j.id, { id: j.id, name: j.name, status: 'active', kind: 'invited' });}
        }
        // The Default Cloud ('Home') is always the first rail entry — it's the Guest
        // Session's Self Channel and the return path from any joined cloud.
        const home: RailCloud = { id: 'default', name: 'Home', status: 'active', kind: 'home' };
        return [home, ...byId.values()];
    }, [rawClouds, joinedClouds]);

    return { clouds, activeCloudId, isFetchingClouds };
};
