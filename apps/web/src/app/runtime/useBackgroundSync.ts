import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

import { useAppForeground } from '../bridge';
import { INVITE_LIST_LIMIT } from '../hooks/useRelayInvites';
import { useChannelSyncMarkStore } from '../stores/useChannelSyncMarkStore';
import { registerBackgroundRefresh } from './backgroundRefresh';
import { syncStreakReporter } from './logging/syncStreakReporter';

const BACKGROUND_SYNC_POLL_MS = 60_000;

export const useBackgroundSync = (): void => {
    const repos = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const activeSiteId = selectedSiteId;
    const uid = session.identity.userId ?? undefined;
    const markChannelSynced = useChannelSyncMarkStore(state => state.markSynced);
    const isRelayServer = session.activeServer.kind !== 'cloud';

    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const hasPendingSentInvite = useCallback(async (): Promise<boolean> => {
        try {
            const { list } = await repos.invite.cacheReadList();
            return list.some(row => row.state === 'pending');
        } catch {
            return false;
        }
    }, [repos.invite]);

    const refreshActiveLists = useCallback(
        async ({ periodic = false }: { periodic?: boolean } = {}) => {
            await Promise.all([
                repos.place
                    .refreshList()
                    .then(() => syncStreakReporter.succeed('place-refresh'))
                    .catch(error => syncStreakReporter.fail('place-refresh', error)),

                repos.user
                    .getMyProfile()
                    .then(() => syncStreakReporter.succeed('my-profile'))
                    .catch(error => syncStreakReporter.fail('my-profile', error)),

                (async () => {
                    try {
                        const channelSyncKind = `channel-sync:${cid}`;
                        const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
                        const { syncedAt } = await repos.channel.syncChannels(since);
                        await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
                        syncStreakReporter.succeed('channel-delta');
                    } catch (error) {
                        syncStreakReporter.fail('channel-delta', error);
                    } finally {
                        markChannelSynced(cid, uid);
                    }
                })(),

                (async () => {
                    if (cid !== 'default') return;
                    if (isGuest) return;
                    if (periodic && !(await hasPendingSentInvite())) return;
                    try {
                        await repos.invite.list({ limit: INVITE_LIST_LIMIT });
                        syncStreakReporter.succeed('sent-invites');
                    } catch (error) {
                        syncStreakReporter.fail('sent-invites', error);
                    }
                })(),

                (async () => {
                    if (!activeSiteId) return;
                    try {
                        const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
                        const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
                        const { syncedAt } = await repos.profile.syncProfiles(since, activeSiteId);
                        await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
                        syncStreakReporter.succeed('profile-delta');
                    } catch (error) {
                        syncStreakReporter.fail('profile-delta', error);
                    }
                })(),
            ]);
        },
        [
            repos.place,
            repos.user,
            repos.channel,
            repos.profile,
            repos.syncMeta,
            repos.invite,
            hasPendingSentInvite,
            isGuest,
            cid,
            uid,
            activeSiteId,
            markChannelSynced,
        ]
    );

    const loadSelfChannel = useCallback(async () => {
        if (!activeSiteId || !isRelayServer) return;
        try {
            await repos.channel.getSelfChannel(undefined, activeSiteId);
            syncStreakReporter.succeed('self-channel');
        } catch (error) {
            syncStreakReporter.fail('self-channel', error);
        }
    }, [repos.channel, activeSiteId, isRelayServer]);

    const prevSiteRef = useRef(activeSiteId);
    const prevVerifiedRef = useRef(false);

    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) {
            prevSiteRef.current = activeSiteId;
            void refreshActiveLists();
            void loadSelfChannel();
        }
    }, [isVerified, activeSiteId, refreshActiveLists, loadSelfChannel]);

    useEffect(() => {
        if (!isVerified || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists({ periodic: true }), BACKGROUND_SYNC_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSwitching, refreshActiveLists]);

    useEffect(() => {
        if (!isVerified || isSwitching || !activeSiteId) return;
        if (prevSiteRef.current === activeSiteId) return;
        prevSiteRef.current = activeSiteId;
        void refreshActiveLists();
        void loadSelfChannel();
    }, [activeSiteId, isVerified, isSwitching, refreshActiveLists, loadSelfChannel]);

    useAppForeground(() => {
        if (!isVerified || isSwitching) return;
        void refreshActiveLists();
    });

    const manualRefreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
    const manualInFlightRef = useRef<Promise<void> | null>(null);
    useEffect(() => {
        manualRefreshRef.current = () => {
            if (!isVerified || isSwitching) return Promise.resolve();
            if (manualInFlightRef.current) return manualInFlightRef.current;
            const pass = Promise.all([refreshActiveLists(), loadSelfChannel()])
                .then(() => undefined)
                .finally(() => {
                    manualInFlightRef.current = null;
                });
            manualInFlightRef.current = pass;
            return pass;
        };
    });
    useEffect(() => registerBackgroundRefresh(() => manualRefreshRef.current()), []);
};
