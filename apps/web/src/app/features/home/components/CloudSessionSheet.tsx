import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Inbox } from 'lucide-react';

import { useInterval } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useCloudSessionCatalog, useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { BottomSheet, CollapsibleSection, Divider } from '@chatic/web-ui-kit';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { useCachedCloudNames, useInvitedClouds } from '../hooks';
import { readCloudUnreadSnapshot } from '../lib';
import { CloudPromoBanner } from './CloudPromoBanner';

import {
    AddAccountButton,
    CloudItem,
    DouHomeItem,
    InviteCloudItem,
    isProvisioning,
    sortCloudsForSwitcher,
} from './cloud-session';

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Opens the subscribe-a-cloud flow. Owned by the host (HomePage) via `useAddCloudFlow` so the
     * 1-cloud cap guard and the plan-picker dialog exist exactly once in the tree.
     */
    onAddCloud: () => void;
}

/**
 * Cloud switcher — a fixed-height bottom sheet holding three collapsible sections: `Home` (relay),
 * `내 클라우드` (owned) and `초대된 클라우드` (invited). Replaced the earlier two-tab layout so all
 * three groups can be scanned at once (Figma 3477-23611 / 3486-25407 / 3486-25889).
 *
 * The "add cloud" button lives in the owned section's FOOTER, outside the collapsible body, so it
 * stays reachable while that section is collapsed.
 */
export const CloudSessionSheet = ({ open, onOpenChange, onAddCloud }: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();

    // Owned clouds come from the relay catalog; invited clouds live in the local cloud cache
    // (cloudType === 'invited') and are NOT in the catalog, so they are observed separately.
    const { clouds: catalogClouds, isCloudsError, isFetchingClouds, refetchClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    // Locally cached names (written first by cloud.update/get) override the relay catalog name so a
    // just-edited subscription-cloud name shows immediately in the switcher.
    const cachedCloudNames = useCachedCloudNames();
    const { switchCloud, isPending: isSwitching } = useSwitchCloudSession();
    const { logoutCloudSession, isLoggingOutCloudSession } = useLogoutCloudSession();
    const { selectedCloudId } = useSessionSelection();

    // Active selection is derived from the session; relay mode reads as 'default'.
    const selectedId = selectedCloudId;

    // Presence dots read the per-cloud unread snapshot (write-through by HomePage, active cloud
    // included). Refreshed when the sheet opens — enough for a "has unread" indicator.
    const [cloudUnread, setCloudUnread] = useState<Record<string, number>>(() => readCloudUnreadSnapshot());
    useEffect(() => {
        if (open) setCloudUnread(readCloudUnreadSnapshot());
    }, [open]);

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
    const prevCloudStatusesRef = useRef<Map<string, NonNullable<CloudView['status']>>>(new Map());

    // Owned clouds = catalog minus anything already surfaced as an invited cloud.
    const invitedCloudIds = new Set(invitedClouds.map(c => c.id ?? ''));
    const clouds = catalogClouds.filter(c => !invitedCloudIds.has(c.id ?? ''));

    useEffect(() => {
        if (open) refetchClouds();
    }, [open]);

    // Detect reserved/init → active transition and show "cloud ready" toast.
    useEffect(() => {
        const prev = prevCloudStatusesRef.current;
        const next = new Map<string, NonNullable<CloudView['status']>>();
        for (const cloud of clouds) {
            if (!cloud.id || !cloud.status) continue;
            const prevStatus = prev.get(cloud.id);
            if (isProvisioning(prevStatus) && cloud.status === 'active') {
                toast({ title: t('cloudSessionSheet.cloudReady') });
            }
            next.set(cloud.id, cloud.status);
        }
        prevCloudStatusesRef.current = next;
    }, [clouds]);

    // Poll every 30s while the sheet is open and there are provisioning clouds.
    useInterval(() => refetchClouds(), open && clouds.some(c => isProvisioning(c.status)) ? 30_000 : null);

    const handleSelectCloud = async (cloudId: string) => {
        handleClose();
        // Optimistic switch + rollback-on-failure live inside switchCloud (session service).
        // Invited clouds enter via the same path — the cache holds the real target cid.
        await switchCloud(cloudId).catch(() => undefined);
    };

    // Disconnect cloud == log out the cloud session and fall back to relay (relay auth kept).
    const handleDisconnect = async () => {
        handleClose();
        await logoutCloudSession().catch(() => undefined);
    };

    const isDefaultSelected = !selectedId || selectedId === 'default';
    const isLoading = isFetchingClouds && clouds.length === 0;

    // Overlay the cached name first so the switcher shows the freshest subscription-cloud name.
    const cloudsWithCachedNames = clouds.map(cloud => {
        const cachedName = cloud.id ? cachedCloudNames[cloud.id] : undefined;
        return cachedName ? { ...cloud, name: cachedName } : cloud;
    });

    // Display order (spec 2-3 / 5-2): selected cloud pinned to top, then creation order (newest
    // first). View-only — logic/polling keeps using the unsorted `clouds`.
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
        // No cloud yet: pitch one. The banner hides itself once dismissed, leaving just the footer
        // button — see useCloudPromo.
        <CloudPromoBanner className="pb-1" />
    ) : (
        <div className="flex flex-col gap-1 px-2">
            {sortedClouds.map(cloud => (
                <CloudItem
                    key={cloud.id}
                    cloud={cloud}
                    isSelected={selectedId === cloud.id}
                    isDisabled={isSwitching}
                    hasUnread={(cloudUnread[cloud.id ?? ''] ?? 0) > 0}
                    onSelectCloud={handleSelectCloud}
                    onErrorClick={() =>
                        toast({
                            title: t('cloudSessionSheet.statusError'),
                            description: cloud.error ?? undefined,
                            variant: 'destructive',
                        })
                    }
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
                closeLabel={t('cloudSessionSheet.close', '닫기')}
                // Fixed height (spec 1): the sheet always opens at its maximum height (matching the
                // BottomSheet's max-h-[90vh] cap) regardless of list length — default height IS the
                // max height, so it never grows/shrinks with content.
                className="h-[90vh]"
            >
                {/* Sections stack here; BottomSheet's own body is the scroller. */}
                <div className="flex flex-col">
                    <CollapsibleSection
                        title={t('cloudSessionSheet.sectionHome')}
                        toggleLabel={t('cloudSessionSheet.toggleSection')}
                    >
                        <div className="px-2 pb-1">
                            <DouHomeItem
                                isSelected={isDefaultSelected}
                                isDisabled={isSwitching || isLoggingOutCloudSession}
                                onSelect={handleDisconnect}
                            />
                        </div>
                    </CollapsibleSection>

                    <Divider className="my-1" />

                    <CollapsibleSection
                        title={t('cloudSessionSheet.sectionMy')}
                        toggleLabel={t('cloudSessionSheet.toggleSection')}
                        count={clouds.length}
                        // The caption only makes sense once there is a list; with zero clouds the
                        // promo banner in the body carries the message instead.
                        description={clouds.length > 0 ? t('cloudSessionSheet.myCloudsDescription') : undefined}
                        footer={<AddAccountButton onClick={onAddCloud} />}
                    >
                        {ownedBody}
                    </CollapsibleSection>

                    <Divider className="my-1" />

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
                            <div className="flex flex-col gap-1 px-2">
                                {sortedInvited.map(inviteCloud => (
                                    <InviteCloudItem
                                        key={inviteCloud.id}
                                        inviteCloud={inviteCloud}
                                        isSelected={selectedId === inviteCloud.id}
                                        isDisabled={isSwitching}
                                        hasUnread={(cloudUnread[inviteCloud.id ?? ''] ?? 0) > 0}
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
