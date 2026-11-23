import { useTranslation } from 'react-i18next';
import { Toaster as SonnerToaster } from 'sonner';

const SONNER_SAFE_OFFSET = { top: 'calc(var(--safe-top, 0px) + 8px)' };

import { GlobalLoader, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { runtime } from '@chatic/runtime';

import { Router } from '../routes';
import { ActiveCloudDataProvider, OtherCloudUnreadProvider, useCloudCatalogRelayResync } from '../hooks';
import { useAutoScrollOnFocus, useDismissKeyboardOnTap, useReturnKeyFlow } from '../ui/hooks';
import { DebugObservationReporter } from '../features/debug';
import { CloudActivatedRunner, CloudPushMarkRunner, UnreadBadgeRunner } from '../features/home';
import { NotificationsRunner } from '../features/notifications';
import { BackgroundCloudsRunner } from './BackgroundCloudsRunner';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { ChatSyncRunner } from './ChatSyncRunner';
import { InvitedCloudDurabilityRunner } from './InvitedCloudDurabilityRunner';
import { PairedCloudNameRunner } from './PairedCloudNameRunner';
import { MyUserSeedRunner } from './MyUserSeedRunner';
import { QueueLossRunner } from './QueueLossRunner';
import { PreferenceLoader } from './PreferenceLoader';
import { useCloudCredentialRenewal } from './useCloudCredentialRenewal';
import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';
import { useSocketWakeRecovery } from './useSocketWakeRecovery';

export const AppRuntime = () => {
    const { t } = useTranslation();
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    useAutoScrollOnFocus();
    useReturnKeyFlow();
    useDismissKeyboardOnTap();

    useSocketWakeRecovery();

    useRelayCredentialRefresh();
    useCloudCatalogRelayResync();

    useCloudCredentialRenewal();

    return (
        <runtime.connection.RuntimeConnectionHost>
            <ActiveCloudDataProvider>
                <OtherCloudUnreadProvider>
                    <PreferenceLoader />
                    <BackgroundSyncRunner />
                    <BackgroundCloudsRunner />
                    <ChatSyncRunner />
                    <UnreadBadgeRunner />
                    <CloudPushMarkRunner />
                    <CloudActivatedRunner />
                    <NotificationsRunner />
                    <MyUserSeedRunner />
                    <InvitedCloudDurabilityRunner />
                    <PairedCloudNameRunner />
                    <QueueLossRunner />
                    <DebugObservationReporter />
                    <VersionUpdateBanner
                        isVisible={hasUpdate}
                        currentVersion={currentVersion}
                        latestVersion={latestVersion}
                        onDismiss={dismissUpdate}
                    />
                    <Router />
                    <GlobalLoader />
                    <SonnerToaster offset={SONNER_SAFE_OFFSET} mobileOffset={SONNER_SAFE_OFFSET} />
                    <Toaster label={t('common.toastRegion')} />
                </OtherCloudUnreadProvider>
            </ActiveCloudDataProvider>
        </runtime.connection.RuntimeConnectionHost>
    );
};
