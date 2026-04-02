import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo, postMessage } from '@chatic/app-messages';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { fetchMembershipInfo, subscriptionKeys, useMembershipInfo } from '@chatic/subscriptions';

import { useSubscriptionIap } from '../hooks';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

const formatDate = (timestamp?: number | null): string => {
    if (!timestamp || timestamp <= 0) return '-';
    return new Date(timestamp).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const SubscriptionPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { isOnMobileApp } = getMobileAppInfo();
    const { restorePurchases } = useSubscriptionIap();
    const [isRestoring, setIsRestoring] = useState(false);

    const { data: membership, isLoading } = useMembershipInfo();
    console.log(membership, 'membership');
    const isActive = membership?.isValid === true;
    const isCanceled = membership?.status === 'canceled';
    const hasPendingChange = !!membership?.pendingProductId;

    const handleViewPlans = async () => {
        const latest = await queryClient.fetchQuery({
            queryKey: subscriptionKeys.detail('mine'),
            queryFn: fetchMembershipInfo,
        });
        if (latest?.isValid) return;
        navigate('/mypage/subscription/plans');
    };

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const count = await restorePurchases();
            toast({
                title:
                    count > 0
                        ? t('mypage.subscription.restoreSuccess', { count })
                        : t('mypage.subscription.restoreEmpty'),
            });
        } catch (e) {
            console.error('[SubscriptionPage] restore failed:', e);
            toast({ title: t('mypage.subscription.restoreFailed'), variant: 'destructive' });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col overflow-y-auto bg-background">
            {/* Header */}
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.subscription.title')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-col gap-[18px] px-4 pb-safe-bottom pt-4">
                {isLoading ? (
                    <div className="flex items-center justify-center pt-20">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                ) : isActive ? (
                    <>
                        {/* Current Subscription */}
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                                {t('mypage.subscription.currentPlan')}
                            </span>

                            <div
                                className={`rounded-[20px] border-2 bg-card p-1.5 shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] ${isCanceled ? 'border-yellow-400' : 'border-[#B0EA10]'}`}
                            >
                                {/* Plan Info */}
                                <div className="flex items-center justify-between gap-2 px-4 py-3">
                                    <span className="min-w-0 truncate text-[18px] font-semibold tracking-[-0.015em]">
                                        {membership?.productId ?? '-'}
                                    </span>
                                    {membership?.grade && (
                                        <span className="shrink-0 rounded-full bg-[#B0EA10]/20 px-2.5 py-0.5 text-[12px] font-semibold uppercase text-[#6a8a00] dark:text-[#B0EA10]">
                                            {membership.grade}
                                        </span>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="mx-auto w-[calc(100%-24px)] border-t border-border" />

                                {/* Status Badge */}
                                {isCanceled && (
                                    <div className="mx-3 mt-1 rounded-[10px] bg-yellow-50 px-3 py-2 text-center dark:bg-yellow-950/30">
                                        <span className="text-[14px] font-medium text-yellow-600 dark:text-yellow-400">
                                            {t('mypage.subscription.canceledNotice', {
                                                date: formatDate(membership?.validUntil),
                                            })}
                                        </span>
                                    </div>
                                )}

                                {/* Pending change */}
                                {hasPendingChange && (
                                    <div className="mx-3 mt-1 rounded-[10px] bg-blue-50 px-3 py-2 text-center dark:bg-blue-950/30">
                                        <span className="text-[14px] font-medium text-blue-600 dark:text-blue-400">
                                            {t('mypage.subscription.pendingChange', {
                                                product: membership?.pendingProductId,
                                            })}
                                        </span>
                                    </div>
                                )}

                                {/* Details */}
                                <div className="flex flex-col gap-[6px] px-3.5 py-3">
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.status')}
                                        </span>
                                        <span
                                            className={`text-[16px] font-medium ${isCanceled ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                                        >
                                            {isCanceled
                                                ? t('mypage.subscription.statusCanceled')
                                                : t('mypage.subscription.statusActive')}
                                        </span>
                                    </div>
                                    {membership?.status$?.renewal && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.renewal')}
                                            </span>
                                            <span
                                                className={`text-[16px] font-medium ${
                                                    membership.status$.renewal === 'auto'
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : membership.status$.renewal === 'pending_cancel'
                                                          ? 'text-yellow-600 dark:text-yellow-400'
                                                          : 'text-red-600 dark:text-red-400'
                                                }`}
                                            >
                                                {t(`mypage.subscription.renewal_${membership.status$.renewal}`)}
                                            </span>
                                        </div>
                                    )}
                                    {membership?.platform && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.platform')}
                                            </span>
                                            <span className="text-[16px] font-medium capitalize">
                                                {membership.platform === 'apple'
                                                    ? 'App Store'
                                                    : membership.platform === 'google'
                                                      ? 'Google Play'
                                                      : membership.platform}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.validFrom ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.startDate')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership.validFrom)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.validUntil ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.expiresAt')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership.validUntil)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.renewedAt ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.renewedAt')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership.renewedAt)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.canceledAt ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.canceledAt')}
                                            </span>
                                            <span className="text-[16px] font-medium text-yellow-600 dark:text-yellow-400">
                                                {formatDate(membership.canceledAt)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.lastSyncAt ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.lastSyncAt')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership.lastSyncAt)}
                                            </span>
                                        </div>
                                    )}
                                    {membership?.receiptId && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.receiptId')}
                                            </span>
                                            <span className="min-w-0 truncate text-[14px] font-medium text-muted-foreground">
                                                {membership.receiptId}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Manage / Restore */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => postMessage({ type: 'OpenSubscriptionManagement' })}
                                className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground"
                            >
                                {t('mypage.subscription.manageSubscription')}
                            </button>
                            {isActive && (
                                <button
                                    onClick={handleRestore}
                                    disabled={isRestoring}
                                    className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground disabled:opacity-50"
                                >
                                    {isRestoring ? (
                                        <Loader2 size={16} className="mx-auto animate-spin" />
                                    ) : (
                                        t('mypage.subscription.restore')
                                    )}
                                </button>
                            )}
                        </div>

                        {!isActive && isOnMobileApp && (
                            <button
                                onClick={handleViewPlans}
                                className="w-full rounded-full bg-foreground py-3 text-[16px] font-semibold text-background"
                            >
                                {t('mypage.subscription.viewPlans')}
                            </button>
                        )}
                    </>
                ) : (
                    /* Empty State */
                    <div className="flex flex-col items-center gap-6 pt-20">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[18px] font-semibold">
                                {isCanceled ? t('mypage.subscription.statusCanceled') : t('mypage.subscription.empty')}
                            </span>
                            <span className="text-[15px] text-muted-foreground">
                                {isCanceled
                                    ? t('mypage.subscription.canceledNotice', {
                                          date: formatDate(membership?.validUntil),
                                      })
                                    : !isOnMobileApp
                                      ? t('mypage.subscription.mobileOnly')
                                      : t('mypage.subscription.emptyDescription')}
                            </span>
                        </div>
                        <button
                            onClick={() => postMessage({ type: 'OpenSubscriptionManagement' })}
                            className="w-full rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground"
                        >
                            {t('mypage.subscription.manageSubscription')}
                        </button>
                        {isOnMobileApp && (
                            <button
                                onClick={handleViewPlans}
                                className="w-full rounded-full bg-foreground py-3 text-[16px] font-semibold text-background"
                            >
                                {t('mypage.subscription.viewPlans')}
                            </button>
                        )}
                    </div>
                )}

                {/* Notice Section */}
                <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center gap-2 px-1">
                        <AlertCircle size={20} className="flex-shrink-0 text-foreground" />
                        <span className="text-[16px] font-semibold">{t('mypage.subscription.notice')}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-1">
                        {(['notice1', 'notice2', 'notice3'] as const).map(key => (
                            <div key={key} className="flex items-start gap-2 px-4 py-1.5">
                                <span className="text-[14px] text-muted-foreground">•</span>
                                <span className="text-[14px] leading-[1.4] tracking-[-0.015em] text-muted-foreground">
                                    {t(`mypage.subscription.${key}`)}
                                </span>
                            </div>
                        ))}
                        <div className="flex items-start gap-2 px-4 py-1.5">
                            <span className="text-[14px] text-muted-foreground">•</span>
                            <span className="text-[14px] leading-[1.4] tracking-[-0.015em] text-muted-foreground">
                                <Trans
                                    i18nKey="mypage.subscription.noticeTerms"
                                    components={{
                                        terms: (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const url = IS_DEV
                                                        ? 'https://app-dev.chatic.io/policy/terms'
                                                        : 'https://app.chatic.io/policy/terms';
                                                    if (isOnMobileApp) {
                                                        postMessage({ type: 'OpenURL', data: { url } });
                                                    } else {
                                                        window.open(url, '_blank');
                                                    }
                                                }}
                                                className="underline text-foreground"
                                            />
                                        ),
                                    }}
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
