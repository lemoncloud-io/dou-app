import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Inbox } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useInterval, useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/runtime';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { useJoinedCloudIds } from '../../../hooks/useJoinedCloudIds';

import { BottomSheet, CollapsibleSection, Divider } from '@chatic/web-ui-kit';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { useSessionLogout } from '../../../runtime/useSessionLogout';
import { useCachedCloudNames, useInvitedClouds, useIsAccountGuest } from '../../../hooks';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';
import { ROUTES } from '../../../routes/paths';
import { RELAY_CLOUD_ID } from '../utils/resolvePushCloudId';
import { CloudPromoBanner } from './CloudPromoBanner';

import {
    AddAccountButton,
    CloudItem,
    DouHomeItem,
    InviteCloudItem,
    isProvisioning,
    PairedCloudItem,
    sortCloudsForSwitcher,
} from './cloud-session';
import { useDevicePairingEnabled } from '../../../hooks/useDevicePairingEnabled';

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddCloud: () => void;
    cloudUnread: Record<string, number>;
}

export const CloudSessionSheet = ({ open, onOpenChange, onAddCloud, cloudUnread }: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();

    const {
        clouds: catalogClouds,
        isCloudsError,
        isFetchingClouds,
        isPendingClouds,
        refetchClouds,
    } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const cachedCloudNames = useCachedCloudNames();
    const { switchCloud, isPending: isSwitching } = runtime.session.useSwitchCloudSession();
    const { logoutCloudSession, isLoggingOutCloudSession } = useLogoutCloudSession();
    const logoutSession = useSessionLogout();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const isAccountGuest = useIsAccountGuest();
    const pairedCloudIds = runtime.session.usePairedCloudIds();
    const pairedCloudNames = runtime.session.usePairedCloudNames();
    const pairingEnabled = useDevicePairingEnabled();
    const showPairedClouds = isAccountGuest && (pairingEnabled || pairedCloudIds.length > 0);

    const selectedId = selectedCloudId;

    const badged = useCloudPushMarkStore(s => s.badged);
    const joinedCloudIds = useJoinedCloudIds(catalogClouds, invitedClouds);
    const catalogCloudIds = useMemo(() => new Set<string>([RELAY_CLOUD_ID, ...joinedCloudIds]), [joinedCloudIds]);
    const isBadged = (cloudId: string) =>
        cloudId !== selectedCloudId && catalogCloudIds.has(cloudId) && !!badged[cloudId];

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
    const prevCloudStatusesRef = useRef<Map<string, NonNullable<CloudView['status']>>>(new Map());

    const invitedCloudIds = new Set(invitedClouds.map(c => c.id ?? ''));
    const clouds = catalogClouds.filter(c => !invitedCloudIds.has(c.id ?? ''));

    useEffect(() => {
        if (open) refetchClouds();
    }, [open]);

    useEffect(() => {
        const prev = prevCloudStatusesRef.current;
        const next = new Map<string, NonNullable<CloudView['status']>>();
        for (const cloud of clouds) {
            if (!cloud.id || !cloud.status) continue;
            const prevStatus = prev.get(cloud.id);
            if (isProvisioning(prevStatus) && cloud.status === 'active') {
                logger.info('CLOUD', 'cloud provisioning completed', { cloudId: cloud.id });
                toast({ title: t('cloudSessionSheet.cloudReady') });
            }
            next.set(cloud.id, cloud.status);
        }
        prevCloudStatusesRef.current = next;
    }, [clouds]);

    useInterval(() => refetchClouds(), open && clouds.some(c => isProvisioning(c.status)) ? 30_000 : null);

    const handleSelectCloud = async (cloudId: string) => {
        handleClose();
        try {
            await switchCloud(cloudId);
            logger.info('CLOUD', 'cloud switch succeeded', { cloudId });
        } catch (error) {
            const pairedCloudEnded = runtime.session.forgetRefusedPairedCloud(cloudId, error);
            if (pairedCloudEnded || runtime.session.isRefusedForEndedPairing(error)) {
                toast({ title: t('pairing.cloud.ended') });
                void logoutSession();
            }
        }
    };

    const handleDisconnect = async () => {
        handleClose();
        try {
            await logoutCloudSession();
        } catch (error) {
            logger.error('CLOUD', 'cloud session disconnect failed', { error });
        }
    };

    const handleInspectCloud = (cloudId: string) => {
        const cloud = clouds.find(c => c.id === cloudId);
        if (cloud?.status === 'error') {
            logger.warn('CLOUD', 'cloud row is in error state', { cloudId, error: cloud.error });
        }
        handleClose();
        navigate(ROUTES.mypage.cloud.hub(cloudId));
    };

    const isDefaultSelected = !selectedId || selectedId === 'default';
    const isLoading = isPendingClouds && isFetchingClouds;

    const cloudsWithCachedNames = clouds.map(cloud => {
        const cachedName = cloud.id ? cachedCloudNames[cloud.id] : undefined;
        return cachedName ? { ...cloud, name: cachedName } : cloud;
    });

    const sortedClouds = sortCloudsForSwitcher(cloudsWithCachedNames, selectedId);
    const sortedInvited = sortCloudsForSwitcher(invitedClouds, selectedId);

    const ownedBody = isLoading ? (
        <div className="flex flex-col gap-[15px] px-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="h-[46px] w-[46px] animate-pulse rounded-full bg-muted" />
                    <div className="flex flex-col gap-1">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    ) : isCloudsError ? (
        <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <span>{t('cloudSessionSheet.errorLoading')}</span>
            <button onClick={() => refetchClouds()} className="flex items-center gap-1 text-foreground">
                <span>{t('cloudSessionSheet.retry')}</span>
            </button>
        </div>
    ) : clouds.length === 0 ? (
        <CloudPromoBanner hasOwnedCloud={false} className="pb-1" />
    ) : (
        <div className="flex flex-col px-2">
            {sortedClouds.map(cloud => (
                <CloudItem
                    key={cloud.id}
                    cloud={cloud}
                    isSelected={selectedId === cloud.id}
                    isDisabled={isSwitching}
                    hasUnread={(cloudUnread[cloud.id ?? ''] ?? 0) > 0 || isBadged(cloud.id ?? '')}
                    onSelectCloud={handleSelectCloud}
                    onInspectCloud={handleInspectCloud}
                />
            ))}
        </div>
    );

    return (
        <>
            <BottomSheet
                open={open}
                onOpenChange={open => !open && handleClose()}
                title={t('cloudSessionSheet.title')}
                onClose={handleClose}
                closeLabel={t('cloudSessionSheet.close')}
                className="h-[90vh]"
            >
                <div className="flex flex-col">
                    <CollapsibleSection
                        title={t('cloudSessionSheet.sectionHome')}
                        toggleLabel={t('cloudSessionSheet.toggleSection')}
                    >
                        <div className="px-2">
                            <DouHomeItem
                                isSelected={isDefaultSelected}
                                isDisabled={isSwitching || isLoggingOutCloudSession}
                                hasUnread={(cloudUnread[RELAY_CLOUD_ID] ?? 0) > 0 || isBadged(RELAY_CLOUD_ID)}
                                onSelect={handleDisconnect}
                            />
                        </div>
                    </CollapsibleSection>

                    <Divider variant="block" className="my-[14px]" />

                    <CollapsibleSection
                        title={t('cloudSessionSheet.sectionMy')}
                        toggleLabel={t('cloudSessionSheet.toggleSection')}
                        count={clouds.length}
                        description={clouds.length > 0 ? t('cloudSessionSheet.myCloudsDescription') : undefined}
                        footer={<AddAccountButton onClick={onAddCloud} />}
                    >
                        {ownedBody}
                    </CollapsibleSection>

                    {showPairedClouds && (
                        <>
                            <Divider variant="block" className="my-[14px]" />
                            <CollapsibleSection
                                title={t('pairing.cloud.section')}
                                toggleLabel={t('cloudSessionSheet.toggleSection')}
                                count={pairedCloudIds.length}
                                description={t('pairing.cloud.sectionDescription')}
                                footer={
                                    pairingEnabled ? (
                                        <button
                                            type="button"
                                            data-testid="paired-cloud-add"
                                            onClick={() => {
                                                handleClose();
                                                navigate(ROUTES.mypage.pairing.code);
                                            }}
                                            className="w-full px-4 py-3 text-left text-[15px] font-medium text-primary"
                                        >
                                            {t('pairing.cloud.add')}
                                        </button>
                                    ) : undefined
                                }
                            >
                                <div className="flex flex-col px-2">
                                    {pairedCloudIds.map(cloudId => (
                                        <PairedCloudItem
                                            key={cloudId}
                                            cloudId={cloudId}
                                            name={cachedCloudNames[cloudId] ?? pairedCloudNames[cloudId]}
                                            isSelected={selectedId === cloudId}
                                            isDisabled={isSwitching}
                                            onSelectCloud={handleSelectCloud}
                                        />
                                    ))}
                                </div>
                            </CollapsibleSection>
                        </>
                    )}

                    <Divider variant="block" className="my-[14px]" />

                    <CollapsibleSection
                        title={t('cloudSessionSheet.sectionInvited')}
                        toggleLabel={t('cloudSessionSheet.toggleSection')}
                        count={invitedClouds.length}
                    >
                        {invitedClouds.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                                <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
                                    <Inbox size={28} className="text-muted-foreground" />
                                </span>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[15px] font-medium leading-[1.4] text-foreground">
                                        {t('cloudSessionSheet.emptyInvited')}
                                    </span>
                                    <span className="text-[13px] leading-[1.4] text-muted-foreground">
                                        {t('cloudSessionSheet.emptyInvitedDescription')}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col px-2">
                                {sortedInvited.map(inviteCloud => (
                                    <InviteCloudItem
                                        key={inviteCloud.id}
                                        inviteCloud={inviteCloud}
                                        isSelected={selectedId === inviteCloud.id}
                                        isDisabled={isSwitching}
                                        hasUnread={
                                            (cloudUnread[inviteCloud.id ?? ''] ?? 0) > 0 ||
                                            isBadged(inviteCloud.id ?? '')
                                        }
                                        onSelectCloud={handleSelectCloud}
                                    />
                                ))}
                            </div>
                        )}
                    </CollapsibleSection>
                </div>
            </BottomSheet>
        </>
    );
};
