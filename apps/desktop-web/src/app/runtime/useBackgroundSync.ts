import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

const BACKGROUND_SYNC_POLL_MS = 60_000;

export const useBackgroundSync = (): void => {
    const repos = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const activeSiteId = selectedSiteId;

    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const refreshActiveLists = useCallback(async () => {
        void repos.place.refreshList().catch(() => {
            /* best-effort */
        });

        void repos.channel.refreshList({ sid: activeSiteId ?? '' }).catch(() => {
            /* best-effort */
        });

        try {
            const channelSyncKind = `channel-sync:${cid}`;
            const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
            const { syncedAt } = await repos.channel.syncChannels(since);
            await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
        } catch {
            // best-effort: on failure the watermark is not advanced → retried with the same since next tick
        }

        if (!activeSiteId) return;

        try {
            const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
            const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
            const { syncedAt } = await repos.profile.syncProfiles(since, activeSiteId);
            await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
        } catch {
            // best-effort: on failure the watermark is not advanced → retried with the same since next tick
        }
    }, [repos.place, repos.channel, repos.profile, repos.syncMeta, cid, activeSiteId]);

    const prevVerifiedRef = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) void refreshActiveLists();
    }, [isVerified, refreshActiveLists]);

    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists(), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);
};
