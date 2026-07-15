import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { Home, X } from 'lucide-react';

import { useInterval } from '@chatic/shared';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudsKeys, useCloudSessionCatalog, useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { useInvitedClouds } from '../hooks';
import { readCloudUnreadSnapshot } from '../lib';
import { CloudNameEditDialog } from './CloudNameEditDialog';
import { SubscriptionSelectDialog } from './SubscriptionSelectDialog';
import { SubscriptionRequiredDialog } from './SubscriptionRequiredDialog';
import {
    AddAccountButton,
    CloudItem,
    InviteCloudItem,
    ProfileSection,
    TabBar,
    getCloudDisplayName,
    isProvisioning,
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

    return (
        <>
            <Sheet open={open} onOpenChange={open => !open && handleClose()}>
                <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-safe-bottom" hideClose>
                    <SheetTitle className="sr-only">{t('cloudSessionSheet.title')}</SheetTitle>
                    <SheetDescription className="sr-only">{t('cloudSessionSheet.title')}</SheetDescription>

                    {/* Close Button */}
                    <div className="flex justify-end px-4 pt-[14px]">
                        <button
                            onClick={handleClose}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAEAEC] dark:bg-[#3A3A3E]"
                        >
                            <X size={14} className="text-foreground" strokeWidth={2} />
                        </button>
                    </div>

                    {/* Profile */}
                    <ProfileSection />

                    {/* Disconnect Cloud Link — shown only while connected to a cloud */}
                    {!isDefaultSelected && (
                        <button
                            onClick={handleDisconnect}
                            disabled={isLoggingOutCloudSession}
                            className="mx-auto mb-4 flex w-fit items-center gap-[6px] rounded-full border border-border bg-secondary px-4 py-[7px] text-[13px] font-medium text-foreground transition-colors active:bg-muted"
                        >
                            <Home size={14} />
                            <span>{t('cloudSessionSheet.disconnectCloud')}</span>
                        </button>
                    )}

                    {/* Tabs */}
                    <TabBar tab={tab} onChange={setTab} inviteCount={invitedClouds.length} />

                    {/* Content */}
                    <div className="max-h-[40vh] overflow-y-auto">
                        <div className="flex flex-col gap-[6px] pt-6">
                            {tab === 'my' ? (
                                isLoading ? (
                                    <div className="flex flex-col gap-[15px] px-3">
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="h-[22px] w-[22px]" />
                                                <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
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
                                ) : clouds.length === 0 ? (
                                    <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
                                        {t('cloudSessionSheet.empty')}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1 px-2">
                                        {clouds.map(cloud => (
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
                                )
                            ) : invitedClouds.length === 0 ? (
                                <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
                                    {t('cloudSessionSheet.emptyInvited')}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1 px-2">
                                    {invitedClouds.map(inviteCloud => (
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

                    {tab === 'my' && !isDefaultSelected && clouds.length < 1 && (
                        <AddAccountButton onClick={handleAddAccount} />
                    )}
                </SheetContent>
            </Sheet>
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
