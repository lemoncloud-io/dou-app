import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Inbox } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useInterval } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useCloudSessionCatalog, useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { BottomSheet, CollapsibleSection, Divider } from '@chatic/web-ui-kit';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { useCachedCloudNames, useInvitedClouds } from '../../../hooks';
import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';
import { RELAY_CLOUD_ID } from '../utils/resolvePushCloudId';
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
    /**
     * Lifted to HomePage (ADR-0056) so the switcher-button dot and this sheet's row dots read the
     * same cross-cloud cache pass instead of each triggering their own.
     */
    cloudUnread: Record<string, number>;
    refreshCloudUnread: () => void;
}

/**
 * Cloud switcher — a fixed-height bottom sheet holding three collapsible sections: `Home` (relay),
 * `내 클라우드` (owned) and `초대된 클라우드` (invited). Replaced the earlier two-tab layout so all
 * three groups can be scanned at once (Figma 3477-23611 / 3486-25407 / 3486-25889).
 *
 * The "add cloud" button lives in the owned section's FOOTER, outside the collapsible body, so it
 * stays reachable while that section is collapsed.
 */
export const CloudSessionSheet = ({
    open,
    onOpenChange,
    onAddCloud,
    cloudUnread,
    refreshCloudUnread,
}: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();

    // Owned clouds come from the relay catalog; invited clouds live in the local cloud cache
    // (cloudType === 'invited') and are NOT in the catalog, so they are observed separately.
    const {
        clouds: catalogClouds,
        isCloudsError,
        isFetchingClouds,
        isPendingClouds,
        refetchClouds,
    } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    // Locally cached names (written first by cloud.update/get) override the relay catalog name so a
    // just-edited subscription-cloud name shows immediately in the switcher.
    const cachedCloudNames = useCachedCloudNames();
    const { switchCloud, isPending: isSwitching } = useSwitchCloudSession();
    const { logoutCloudSession, isLoggingOutCloudSession } = useLogoutCloudSession();
    const { selectedCloudId } = useSessionSelection();
    const requestEmailBind = useEmailBindRequest(s => s.requestEmailBind);

    // Active selection is derived from the session; relay mode reads as 'default'.
    const selectedId = selectedCloudId;

    // Re-read the cache-hint half of the dot when the sheet opens — enough for a "has unread" hint,
    // and the row for the cloud you are already in needs no dot.
    useEffect(() => {
        if (open) refreshCloudUnread();
    }, [open, refreshCloudUnread]);

    // Cross-cloud push marks (ADR-0056 결정 2) — the other half of the dot, for pushes that arrived
    // while away. Filtered to clouds actually in this account's catalog (owned + invited + relay)
    // and never the active one, so a stale/foreign mark can't paint a dot nothing else corroborates.
    const badged = useCloudPushMarkStore(s => s.badged);
    const catalogCloudIds = useMemo(() => {
        const ids = new Set<string>([RELAY_CLOUD_ID]);
        for (const cloud of catalogClouds) if (cloud.id) ids.add(cloud.id);
        for (const cloud of invitedClouds) if (cloud.id) ids.add(cloud.id);
        return ids;
    }, [catalogClouds, invitedClouds]);
    const isBadged = (cloudId: string) =>
        cloudId !== selectedCloudId && catalogCloudIds.has(cloudId) && !!badged[cloudId];

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
                logger.info('CLOUD', 'cloud provisioning completed', { cloudId: cloud.id });
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
        try {
            await switchCloud(cloudId);
            logger.info('CLOUD', 'cloud switch succeeded', { cloudId });
        } catch {
            // Deliberately not logged here: the session service already records the failure and does
            // the cid/sid rollback. A second entry would double the error count — and `error` advances
            // the upload flush, so it would double that too.
        }
    };

    // Disconnect cloud == log out the cloud session and fall back to relay (relay auth kept).
    const handleDisconnect = async () => {
        handleClose();
        try {
            await logoutCloudSession();
        } catch (error) {
            // Unlike the switch above, nothing downstream records this — `logoutCloudSession` has no
            // try/catch of its own, so without this line a failed disconnect leaves no trace at all.
            logger.error('CLOUD', 'cloud session disconnect failed', { error });
        }
    };

    // Tapping a failed row explains the state and points at the one thing that fixes it (release it
    // in 클라우드 관리, then add it again). The record's raw `error` is a server trace — it goes to the
    // log, where support can read it, and never into the toast.
    const handleErrorClick = (cloud: CloudView) => {
        logger.warn('CLOUD', 'cloud row is in error state', { cloudId: cloud.id, error: cloud.error });
        toast({
            title: t('cloudSessionSheet.statusErrorTitle'),
            description: t('cloudSessionSheet.statusErrorGuide'),
            variant: 'destructive',
        });
    };

    const isDefaultSelected = !selectedId || selectedId === 'default';
    // Skeleton on the FIRST load only. Keying it off `isFetching` made every background refetch
    // (the sheet refetches on open, and `useClouds` is `refetchOnMount: 'always'`) replace the list —
    // and for a zero-cloud account it replaced the promo banner, which never stopped shimmering.
    // `isPending` is true only while there is no data yet; the extra `isFetching` guard keeps a
    // disabled query (unauthenticated) from pinning the skeleton on.
    const isLoading = isPendingClouds && isFetchingClouds;

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
        // This branch IS the zero-owned-cloud case, so the banner's own gate is satisfied.
        <CloudPromoBanner hasOwnedCloud={false} className="pb-1" />
    ) : (
        // Rows butt up against each other (Figma 3486:25641 — 61px rows at y=55/116/177/…): the
        // row's own py-2 IS the spacing, so no gap between them.
        <div className="flex flex-col px-2">
            {sortedClouds.map(cloud => (
                <CloudItem
                    key={cloud.id}
                    cloud={cloud}
                    isSelected={selectedId === cloud.id}
                    isDisabled={isSwitching}
                    hasUnread={(cloudUnread[cloud.id ?? ''] ?? 0) > 0 || isBadged(cloud.id ?? '')}
                    onSelectCloud={handleSelectCloud}
                    onErrorClick={() => handleErrorClick(cloud)}
                    onRequestEmailBind={requestEmailBind}
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
                        <div className="px-2">
                            <DouHomeItem
                                isSelected={isDefaultSelected}
                                isDisabled={isSwitching || isLoggingOutCloudSession}
                                hasUnread={(cloudUnread[RELAY_CLOUD_ID] ?? 0) > 0 || isBadged(RELAY_CLOUD_ID)}
                                onSelect={handleDisconnect}
                            />
                        </div>
                    </CollapsibleSection>

                    {/* Section separator: the Figma sheet uses the 4px `block` band (Rectangle 1037/1038,
                        375×4) with 14px of air on each side — not the 1px row hairline. */}
                    <Divider variant="block" className="my-[14px]" />

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
