import { useMemo } from 'react';

import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';

import { useCloudSession } from '@chatic/app-runtime';

/** Minimal cloud shape the rail needs (id guaranteed present). */
export interface RailCloud {
    id: string;
    name?: string;
    status?: string;
}

/**
 * Cloud list + currently-active cloud id for the cloud rail. The active id
 * prefers the live socket store and falls back to persisted selection so the
 * rail highlights correctly before the socket reports a cloud.
 */
export const useClouds = () => {
    const { clouds: rawClouds, isFetchingClouds } = useCloudSession();
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    // Fall back to 'default' so the synthesized Home workspace highlights in relay mode.
    const activeCloudId = storeCloudId || cloudCore.getSelectedCloudId() || (rawClouds.length === 0 ? 'default' : null);

    const clouds = useMemo<RailCloud[]>(() => {
        const mapped = rawClouds
            .filter((c): c is typeof c & { id: string } => !!c.id)
            .map(c => ({ id: c.id, name: c.name, status: c.status as string | undefined }));
        // Relay/default mode: the user has no clouds but still works in the
        // implicit "default" workspace — show it so the rail isn't a dead column.
        if (mapped.length === 0) return [{ id: 'default', name: 'Home', status: 'active' }];
        return mapped;
    }, [rawClouds]);

    return { clouds, activeCloudId, isFetchingClouds };
};
