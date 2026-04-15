import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { AlertCircle, Check, Loader2, Plus, User, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { useInterval } from '@chatic/shared';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import { cloudsKeys } from '@chatic/users';

import { useCloudSession } from '../../../shared/hooks/useCloudSession';
import { useInviteClouds } from '../../../shared/hooks/useInviteClouds';
import { SubscriptionSelectDialog } from './SubscriptionSelectDialog';
import { SubscriptionRequiredDialog } from './SubscriptionRequiredDialog';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { InviteCloudView } from '@chatic/app-messages';

// --- Shared Styles ---

const SELECTED_HIGHLIGHT = 'bg-[#F3F0FF] dark:bg-[#2D2640]';
const CLOUD_AVATAR_CLASS =
    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)] dark:border-[#3A3A3E] dark:bg-[rgba(255,255,255,0.06)]';

// --- Profile Section ---

const ProfileSection = () => {
    const { profile } = useWebCoreStore();

    const name = profile?.$user.name;
    const email = profile?.$user?.email ?? '';
    const photo = profile?.$user?.photo;

    return (
        <div className="flex flex-col items-center gap-[9px] py-4">
            <div className="flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-full border border-background bg-secondary">
                {photo ? (
                    <img src={photo} alt={name} className="h-full w-full object-cover" />
                ) : (
                    <User size={20} className="text-placeholder" />
                )}
            </div>
            <div className="flex flex-col items-center gap-[2px]">
                <span className="text-[17px] font-semibold leading-[1.19] tracking-[-0.025em] text-foreground">
                    {name}
                </span>
                <span className="text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                    {email}
                </span>
            </div>
        </div>
    );
};

// --- Cloud List Item ---

const isProvisioning = (status?: CloudView['status']): boolean => status === 'reserved' || status === 'init';

const getCloudDisplayName = (cloud: CloudView): string => {
    return cloud.name ?? cloud.email?.split('@')[0] ?? '';
};

const CloudStatusBadge = ({ status }: { status: CloudView['status'] }) => {
    const { t } = useTranslation();

    const configs: Partial<Record<NonNullable<CloudView['status']>, { label: string; className: string }>> = {
        active: { label: t('cloudSessionSheet.statusActive'), className: 'text-[#2A7EF4]' },
        reserved: { label: t('cloudSessionSheet.statusReserved'), className: 'text-label' },
        suspended: { label: t('cloudSessionSheet.statusSuspended'), className: 'text-yellow-600 dark:text-yellow-400' },
        expired: { label: t('cloudSessionSheet.statusExpired'), className: 'text-gray-400' },
        error: { label: t('cloudSessionSheet.statusError'), className: 'text-red-500' },
    };

    const config = status ? configs[status] : null;
    if (!config) return null;

    return (
        <div className="flex items-center gap-1 rounded-[5px] bg-secondary px-[6px] py-1">
            <span className={`text-[14px] font-medium leading-[1.19] ${config.className}`}>{config.label}</span>
            {status === 'active' && <Check size={16} className="text-[#2A7EF4]" strokeWidth={1.5} />}
        </div>
    );
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectCloud: (cloudId: string) => void;
    onErrorClick: () => void;
}

const CloudItem = ({ cloud, isSelected, isDisabled, onSelectCloud, onErrorClick }: CloudItemProps) => {
    const { t } = useTranslation();
    const isError = cloud.status === 'error';
    const isActive = cloud.status === 'active';
    const disabled = isDisabled || isSelected || !isActive;
    const displayName = getCloudDisplayName(cloud);
    const hasName = !!displayName;

    return (
        <button
            onClick={() => {
                if (isError) {
                    onErrorClick();
                    return;
                }
                if (!disabled && cloud.id) onSelectCloud(cloud.id);
            }}
            disabled={isDisabled || !isActive}
            className={cn(
                'flex w-full items-center gap-[5px] rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                disabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
                {isProvisioning(cloud.status) ? (
                    <Loader2 size={18} className="animate-spin text-[#9FA2A7]" />
                ) : isError ? (
                    <AlertCircle size={20} className="text-red-500" />
                ) : (
                    isSelected && <Check size={22} className="text-[#C139E3]" strokeWidth={2} />
                )}
            </div>
            <div className="flex flex-1 items-center gap-3 pr-[6px]">
                <div className={CLOUD_AVATAR_CLASS}>
                    <User size={16} className="text-placeholder" />
                </div>
                <div className="flex flex-col gap-0.5">
                    {hasName ? (
                        <div className="flex items-center gap-[6px]">
                            <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                                {displayName}
                            </span>
                            <CloudStatusBadge status={cloud.status} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-[6px]">
                            <AlertCircle size={18} className="text-white" />
                            <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                                {t('cloudSessionSheet.setupProfile')}
                            </span>
                        </div>
                    )}
                    <span className="text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                        {cloud.email ?? ''}
                    </span>
                    {isProvisioning(cloud.status) && (
                        <span className="text-left text-[12px] leading-[1.3] text-[#9FA2A7]">
                            {t('cloudSessionSheet.statusReservedDescription')}
                        </span>
                    )}
                    {isError && cloud.error && (
                        <span className="text-left text-[11px] leading-[1.3] text-red-400">{cloud.error}</span>
                    )}
                </div>
            </div>
        </button>
    );
};

// --- Invite Cloud Item ---

const InviteCloudItem = ({ inviteCloud, isSelected }: { inviteCloud: InviteCloudView; isSelected: boolean }) => {
    const displayName = inviteCloud.name ?? inviteCloud.id ?? '';

    return (
        <div
            className={cn(
                'flex items-center gap-[5px] rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT
            )}
        >
            <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
                {isSelected && <Check size={22} className="text-[#C139E3]" strokeWidth={2} />}
            </div>
            <div className="flex flex-1 items-center gap-3 pr-[6px]">
                <div className={CLOUD_AVATAR_CLASS}>
                    <User size={16} className="text-placeholder" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                        {displayName}
                    </span>
                    <span className="text-left text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                        ID: {inviteCloud.id}
                    </span>
                </div>
            </div>
        </div>
    );
};

// --- Add Account Button ---

const AddAccountButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();

    return (
        <div className="px-4 pb-4 pt-10">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-center gap-[6px] rounded-full border border-foreground px-6 py-3"
            >
                <span className="text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-foreground">
                    {t('cloudSessionSheet.addAccount')}
                </span>
                <Plus size={24} className="text-foreground" />
            </button>
        </div>
    );
};

// --- Tab ---

type Tab = 'my' | 'invited';

const TabBar = ({ tab, onChange, inviteCount }: { tab: Tab; onChange: (t: Tab) => void; inviteCount: number }) => {
    const { t } = useTranslation();
    return (
        <div className="relative mx-4 flex rounded-lg bg-[#F4F5F5] p-[3px] dark:bg-[#2A2A2E]">
            <div
                className="absolute bottom-[3px] top-[3px] w-[calc(50%-3px)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-[#3A3A3E]"
                style={{ transform: tab === 'my' ? 'translateX(3px)' : 'translateX(calc(100% + 3px))' }}
            />
            {(['my', 'invited'] as Tab[]).map(key => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={cn(
                        'relative z-10 flex-1 py-2 text-[14px] font-medium transition-colors',
                        tab === key ? 'text-foreground' : 'text-muted-foreground'
                    )}
                >
                    {key === 'my'
                        ? t('cloudSessionSheet.tabMy')
                        : `${t('cloudSessionSheet.tabInvited')}${inviteCount > 0 ? ` (${inviteCount})` : ''}`}
                </button>
            ))}
        </div>
    );
};

// --- Main Sheet ---

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CloudSessionSheet = ({ open, onOpenChange }: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { selectCloud, isPending, clouds, isCloudsError, isFetchingClouds, refetchClouds } = useCloudSession();
    const { inviteClouds } = useInviteClouds();

    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedCloudId());
    const [isSubscriptionSelectOpen, setIsSubscriptionSelectOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('my');

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
    const prevCloudStatusesRef = useRef<Map<string, NonNullable<CloudView['status']>>>(new Map());

    useEffect(() => {
        if (open) {
            setSelectedId(cloudCore.getSelectedCloudId());
            refetchClouds();
        }
    }, [open]);

    // Detect reserved/init → active transition and show "cloud ready" toast
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

    // Poll every 30s while sheet is open and there are provisioning clouds
    useInterval(() => refetchClouds(), open && clouds.some(c => isProvisioning(c.status)) ? 30_000 : null);

    const handleAddAccount = () => {
        if (clouds.length >= 1) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        setIsSubscriptionSelectOpen(true);
    };

    const handleSelectCloud = async (cloudId: string) => {
        try {
            await selectCloud(cloudId);
            setSelectedId(cloudId);
            handleClose();
        } catch (e) {
            console.error('[CloudSessionSheet] selectCloud failed:', e);
            toast({ title: t('cloudSessionSheet.switchFailed'), variant: 'destructive' });
        }
    };

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

                    {/* Tabs */}
                    <TabBar tab={tab} onChange={setTab} inviteCount={inviteClouds.length} />

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
                                                isDisabled={isPending}
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
                                )
                            ) : inviteClouds.length === 0 ? (
                                <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
                                    {t('cloudSessionSheet.emptyInvited')}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1 px-2">
                                    {inviteClouds.map(inviteCloud => (
                                        <InviteCloudItem
                                            key={inviteCloud.id}
                                            inviteCloud={inviteCloud}
                                            isSelected={selectedId === inviteCloud.id}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {tab === 'my' && <AddAccountButton onClick={handleAddAccount} />}
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
        </>
    );
};
