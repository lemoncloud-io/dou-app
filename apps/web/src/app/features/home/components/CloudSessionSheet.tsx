import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check, Loader2, Plus, User, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import { useIsSubscriptionAvailable } from '@chatic/subscriptions';

import { useCloudSession } from '../../../shared/hooks/useCloudSession';
import { AddAccountDialog } from './AddAccountDialog';
import { SubscriptionRequiredDialog } from './SubscriptionRequiredDialog';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

// --- Profile Section (Top) ---

const ProfileSection = () => {
    const { profile } = useWebCoreStore();
    const name = profile?.$user?.name ?? '';
    const email = profile?.$user?.email ?? '';

    return (
        <div className="flex flex-col items-center gap-[9px] py-4">
            <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-background bg-secondary">
                <User size={20} className="text-placeholder" />
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

const getCloudDisplayName = (cloud: CloudView): string => {
    return cloud.name ?? cloud.email?.split('@')[0] ?? '';
};

const CloudStatusBadge = ({ status }: { status: CloudView['status'] }) => {
    const { t } = useTranslation();

    if (status === 'active') {
        return (
            <div className="flex items-center gap-1 rounded-[5px] bg-secondary px-[6px] py-1">
                <span className="text-[14px] font-medium leading-[1.19] text-[#2A7EF4]">
                    {t('cloudSessionSheet.statusActive')}
                </span>
                <Check size={16} className="text-[#2A7EF4]" strokeWidth={1.5} />
            </div>
        );
    }

    if (status === 'pending') {
        return (
            <div className="flex items-center rounded-[5px] bg-secondary px-[6px] py-1">
                <span className="text-[14px] font-medium leading-[1.19] text-label">
                    {t('cloudSessionSheet.statusPending')}
                </span>
            </div>
        );
    }

    return null;
};

interface CloudItemProps {
    cloud: CloudView;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectCloud: (cloudId: string) => void;
}

const CloudItem = ({ cloud, isSelected, isDisabled, onSelectCloud }: CloudItemProps) => {
    const { t } = useTranslation();
    const disabled = isDisabled || isSelected || cloud.status === 'pending';
    const displayName = getCloudDisplayName(cloud);
    const hasName = !!displayName;

    return (
        <button
            onClick={() => !disabled && cloud.id && onSelectCloud(cloud.id)}
            disabled={disabled}
            className={cn('flex w-full items-center gap-[5px]', disabled && !isSelected && 'cursor-not-allowed')}
        >
            {/* Check icon area */}
            <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
                {cloud.status === 'pending' ? (
                    <Loader2 size={18} className="animate-spin text-[#9FA2A7]" />
                ) : (
                    isSelected && <Check size={22} className="text-[#C139E3]" strokeWidth={1.5} />
                )}
            </div>

            {/* Avatar + Info */}
            <div className="flex flex-1 items-center gap-2 pr-[6px]">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)]">
                    <User size={16} className="text-placeholder" />
                </div>
                <div className="flex flex-col gap-1">
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
                </div>
            </div>
        </button>
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

// --- Main Sheet ---

interface CloudSessionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CloudSessionSheet = ({ open, onOpenChange }: CloudSessionSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { selectPlace, isPending, clouds, isCloudsError, isFetchingClouds, refetchClouds } = useCloudSession();
    const { isAvailable: isSubscriptionAvailable } = useIsSubscriptionAvailable();
    const [selectedId, setSelectedId] = useState<string | null>(cloudCore.getSelectedCloudId());
    const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);

    const handleAddAccount = () => {
        if (clouds.length >= 1) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        if (!isSubscriptionAvailable) {
            handleClose();
            setIsSubscriptionRequiredOpen(true);
            return;
        }
        setIsAddAccountOpen(true);
    };

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

    const handleSelectCloud = async (cloudId: string) => {
        try {
            await selectPlace(cloudId);
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
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAEAEC]"
                        >
                            <X size={14} className="text-foreground" strokeWidth={2} />
                        </button>
                    </div>

                    {/* Profile */}
                    <ProfileSection />

                    {/* Cloud List */}
                    <div className="flex flex-col gap-[6px] pt-6">
                        {isLoading ? (
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
                            <div className="flex flex-col gap-[15px] px-3">
                                {clouds.map(cloud => (
                                    <CloudItem
                                        key={cloud.id}
                                        cloud={cloud}
                                        isSelected={selectedId === cloud.id}
                                        isDisabled={isPending}
                                        onSelectCloud={handleSelectCloud}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {clouds.length < 2 && <AddAccountButton onClick={handleAddAccount} />}
                </SheetContent>
            </Sheet>
            <AddAccountDialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen} />
            <SubscriptionRequiredDialog
                open={isSubscriptionRequiredOpen}
                onClose={() => setIsSubscriptionRequiredOpen(false)}
            />
        </>
    );
};
