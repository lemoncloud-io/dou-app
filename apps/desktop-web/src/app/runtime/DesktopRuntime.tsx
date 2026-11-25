import { useEffect, useMemo } from 'react';

import { runtime } from '@chatic/runtime-react';
import { TooltipProvider } from '@chatic/ui-kit';

import { useInviteLoginPageStore } from '../features/auth/stores/useInviteLoginPageStore';
import { AppRouter } from '../routes';
import {
    AppToaster,
    ConnectionBanner,
    UpdateBanner,
    useClouds,
    useCloudRecordOwnership,
    useCrossCloudPushBadge,
    useCrossCloudPushNotifications,
    useDesktopBadge,
    useDesktopNotifications,
    usePlaceNotifyInheritance,
    useDeviceTokenRegistration,
    useInboxCapture,
    useMyThreadsCapture,
    usePlaceProfiles,
    usePushInvitedCloudRecovery,
    usePlaceUnreadCounts,
    useRefreshOnPush,
    useChatOutbox,
    useCloudPushBadgeStore,
    useRetainLeavingCloudBadge,
    useSocketWakeRecovery,
    useSocketWedgeReload,
    useUnreadStore,
    startSocketFrameLog,
} from '../shared';
import { BackgroundCloudsRunner } from './BackgroundCloudsRunner';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { useRealtimeProfileSync } from './useRealtimeProfileSync';
import { usePairedCloudSignOut } from './usePairedCloudSignOut';
import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

const DesktopNotifications = () => {
    usePlaceProfiles();
    useDesktopNotifications();
    usePlaceNotifyInheritance();
    useRealtimeProfileSync();
    useDeviceTokenRegistration();
    useCrossCloudPushNotifications();
    useCrossCloudPushBadge();
    usePushInvitedCloudRecovery();
    useInboxCapture();
    useMyThreadsCapture();
    useRefreshOnPush();
    useSocketWakeRecovery();
    useSocketWedgeReload();
    useChatOutbox();
    return null;
};

const AuthedCloudRecords = () => {
    useCloudRecordOwnership();
    return null;
};

const AuthedNotifications = () => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    return isAuthenticated ? <DesktopNotifications /> : null;
};

const ShellUnreadSync = () => {
    const unread = usePlaceUnreadCounts();
    const setUnread = useUnreadStore(s => s.setUnread);
    useEffect(() => {
        setUnread(unread);
    }, [unread, setUnread]);

    const { total } = unread;
    useRetainLeavingCloudBadge(total);

    const { clouds, activeCloudId } = useClouds();
    const railCloudIds = useMemo(() => new Set(clouds.map(c => c.id)), [clouds]);
    const badgedClouds = useCloudPushBadgeStore(s => s.badged);
    const crossCloudCount = Object.keys(badgedClouds).filter(id => id !== activeCloudId && railCloudIds.has(id)).length;
    const badgeTotal = total + crossCloudCount;
    useDesktopBadge(badgeTotal);
    useEffect(() => {
        document.title = badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) DoU` : 'DoU';
    }, [badgeTotal]);

    return null;
};

export const DesktopRuntime = () => {
    useEffect(() => {
        startSocketFrameLog();
    }, []);

    useRelayCredentialRefresh();

    runtime.session.useCloudCredentialGuard();
    usePairedCloudSignOut();
    const inviteAttemptHeld = useInviteLoginPageStore(s => s.held);

    return (
        <runtime.connection.RuntimeAuthHost>
            <TooltipProvider delayDuration={300}>
                <BackgroundSyncRunner />
                <BackgroundCloudsRunner />
                <AuthedNotifications />
                <AuthedCloudRecords />
                <ShellUnreadSync />
                <div className="flex h-full flex-col">
                    <div className="flex shrink-0 flex-col">
                        <ConnectionBanner quiet={inviteAttemptHeld} />
                        <UpdateBanner />
                    </div>
                    <div className="relative min-h-0 flex-1">
                        <AppRouter />
                        <AppToaster />
                    </div>
                </div>
            </TooltipProvider>
        </runtime.connection.RuntimeAuthHost>
    );
};
