import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { Inbox } from 'lucide-react';

import { useInterval } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudsKeys, useCloudSessionCatalog, useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { BottomSheet } from '@chatic/web-ui-kit';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { useCachedCloudNames, useInvitedClouds } from '../hooks';
import { readCloudUnreadSnapshot } from '../lib';
import { CloudNameEditDialog } from './CloudNameEditDialog';
import { SubscriptionSelectDialog } from './SubscriptionSelectDialog';
import { SubscriptionRequiredDialog } from './SubscriptionRequiredDialog';

import {
    AddAccountButton,
    CloudItem,
    DouHomeItem,
    InviteCloudItem,
    TabBar,
    getCloudDisplayName,
    isProvisioning,
    sortCloudsForSwitcher,
    type CloudTab,
} from './cloud-session';

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CloudSessionSheet = ({ open, onOpenChange }: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();

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

    const [isSubscriptionSelectOpen, setIsSubscriptionSelectOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);
    const [tab, setTab] = useState<CloudTab>('my');
    const [editingCloud, setEditingCloud] = useState<CloudView | null>(null);

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

    const handleAddAccount = () => {
        if (clouds.length >= 1) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        setIsSubscriptionSelectOpen(true);
    };

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
                footer={
                    tab === 'my' && !isDefaultSelected && clouds.length < 1 ? (
                        <AddAccountButton onClick={handleAddAccount} />
                    ) : undefined
                }
            >
                <div className="flex h-full flex-col">
                    {/* Tabs — pinned above the scroll area. Returning to relay is done by selecting
                        the DoU Home row below, so the standalone disconnect link is gone. */}
                    <div className="shrink-0">
                        <TabBar tab={tab} onChange={setTab} inviteCount={invitedClouds.length} />
                    </div>

                    {/* Content — only this region scrolls inside the fixed-height sheet. */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <div className="flex flex-col gap-[6px] pt-6">
                            {tab === 'my' ? (
                                <>
                                    {/* DoU Home (relay) is always the top row; selecting it returns to relay. */}
                                    <div className="px-2">
                                        <DouHomeItem
                                            isSelected={isDefaultSelected}
                                            isDisabled={isSwitching || isLoggingOutCloudSession}
                                            onSelect={handleDisconnect}
                                        />
                                    </div>
                                    {isLoading ? (
                                        <div className="flex flex-col gap-[15px] px-3">
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
                                            <button
                                                onClick={() => refetchClouds()}
                                                className="flex items-center gap-1 text-foreground"
                                            >
                                                <span>{t('cloudSessionSheet.retry')}</span>
                                            </button>
                                        </div>
                                    ) : clouds.length === 0 ? null : (
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
                                                    onEditCloud={setEditingCloud}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : invitedClouds.length === 0 ? (
                                // Empty state (invited tab) — centered icon + title + description,
                                // filling the fixed-height sheet.
                                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
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
                        </div>
                    </div>
                </div>
            </BottomSheet>
            <SubscriptionSelectDialog
                open={isSubscriptionSelectOpen}
                onOpenChange={setIsSubscriptionSelectOpen}
                onComplete={() => {
                    toast({
                        title: t('addAccount.success'),
                        description: t('mypage.subscription.purchaseSuccessDescription'),
                    });
                    queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
                }}
                onError={e => toast({ title: e.message, variant: 'destructive' })}
            />
            <SubscriptionRequiredDialog
                open={isSubscriptionRequiredOpen}
                onClose={() => setIsSubscriptionRequiredOpen(false)}
            />
            {editingCloud?.id && (
                <CloudNameEditDialog
                    open={!!editingCloud}
                    onOpenChange={open => !open && setEditingCloud(null)}
                    currentName={getCloudDisplayName(editingCloud)}
                    cloudId={editingCloud.id}
                    onSuccess={newName => {
                        queryClient.setQueriesData<ListResult<CloudView>>({ queryKey: cloudsKeys.lists() }, old => {
                            if (!old?.list) return old;
                            return {
                                ...old,
                                list: old.list.map(c => (c.id === editingCloud.id ? { ...c, name: newName } : c)),
                            };
                        });
                    }}
                />
            )}
        </>
    );
};
