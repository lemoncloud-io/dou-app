import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { useNavigateWithTransition } from '@chatic/shared';
import { isNative } from '@chatic/bridges';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { appBridge } from '../../../bridge';
import { useMembershipInfo } from '../../../hooks/useMembership';

import { EmailRequiredBanner, ExcessCloudBanner } from '../components';
import { planDisplayName } from '../lib';
import { usePlanCatalog, usePlanPrice, useRestorePurchases } from '../hooks';
import { POLICY_BASE_URL } from '../consts';
import { ROUTES } from '../../../routes/paths';

const formatDate = (timestamp?: number | null): string => {
    if (!timestamp || timestamp <= 0) return '-';
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const SubscriptionPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    useQueryClient();
    const isOnMobileApp = isNative();
    const { restore, isRestoring, canRestore } = useRestorePurchases();

    const { data: membership, isLoading } = useMembershipInfo();
    const { summary, currentPlan, pendingPlan, isIOS } = usePlanCatalog();
    const priceOf = usePlanPrice();
    const isKo = i18n.language.startsWith('ko');
    const { isGuest } = useRuntimeProfile();

    // One judgement, four states (`summarizeMembership`). The screen used to branch on
    // `isActive || isExpired`, which dropped a scheduled cancellation into the empty state — both
    // flags are false there, even though the subscription is still running and paid for.
    const isActive = summary.state === 'active';
    const isCanceled = summary.state === 'cancelScheduled';
    const isExpired = summary.state === 'expired';
    const hasSubscription = summary.state !== 'none';
    // A pending tier change or a next-payment date only means something while the paid period is
    // still running — an expired membership can carry a stale `pendingProductId` (a downgrade that
    // was queued but never applied because the user let the subscription lapse instead of renewing).
    const hasPendingChange = summary.isEntitled && !!summary.pendingProductId;
    // Where to manage a subscription depends on the store it was bought on, not the current device.
    // Fall back to this device's store only pre-subscription, when there is no membership to read one off.
    const managePlatform =
        membership?.platform === 'google'
            ? 'google'
            : membership?.platform === 'apple'
              ? 'apple'
              : isIOS
                ? 'apple'
                : 'google';

    // No guest branch here: the plans screen asks before sending anyone to login (Figma
    // 2870-33015). Redirecting from this button too would give the same intent two behaviours.
    const handleViewPlans = () => navigate(ROUTES.subscription.plans);

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
                {/* Over the allowance after a downgrade — detection only, no delete button here. */}
                <ExcessCloudBanner />
                {/* A cloud created without an email (a skipped purchase or add-cloud step) — the one
                    dialog that can fix it, surfaced here rather than left silently unusable. */}
                <EmailRequiredBanner />

                {isLoading ? (
                    <div className="flex items-center justify-center pt-20">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                ) : hasSubscription ? (
                    <>
                        {/* Current Subscription */}
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                                {t('mypage.subscription.currentPlan')}
                            </span>

                            <div
                                className={`rounded-[20px] border-2 bg-card p-1.5 shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] ${isCanceled ? 'border-yellow-400' : isExpired ? 'border-gray-300' : 'border-[#B0EA10]'}`}
                            >
                                {/* Plan Info */}
                                <div className="flex items-center justify-between gap-2 px-4 py-3">
                                    <span className="min-w-0 truncate text-[18px] font-semibold tracking-[-0.015em]">
                                        {planDisplayName(currentPlan, isKo) ?? summary.productId ?? '-'}
                                    </span>
                                    {(currentPlan?.grade ?? membership?.grade) && (
                                        <span className="shrink-0 rounded-full bg-[#B0EA10]/20 px-2.5 py-0.5 text-[12px] font-semibold uppercase text-[#6a8a00] dark:text-[#B0EA10]">
                                            {currentPlan?.grade ?? membership?.grade}
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
                                                product: planDisplayName(pendingPlan, isKo) ?? summary.pendingProductId,
                                            })}
                                        </span>
                                    </div>
                                )}

                                {/* Free trial — only shown when both the product and the receipt back it. */}
                                {summary.trialDaysLeft != null && (
                                    <div className="mx-3 mt-1 rounded-[10px] bg-[#B0EA10]/15 px-3 py-2 text-center">
                                        <span className="text-[14px] font-medium text-[#6a8a00] dark:text-[#B0EA10]">
                                            {t('mypage.subscription.trialRemaining', { days: summary.trialDaysLeft })}
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
                                            className={`text-[16px] font-medium ${isCanceled ? 'text-yellow-600 dark:text-yellow-400' : isExpired ? 'text-gray-400' : 'text-green-600 dark:text-green-400'}`}
                                        >
                                            {isCanceled
                                                ? t('mypage.subscription.statusCanceled')
                                                : isExpired
                                                  ? t('mypage.subscription.statusExpired')
                                                  : t('mypage.subscription.statusActive')}
                                        </span>
                                    </div>
                                    {currentPlan?.maxClouds != null && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.allowance')}
                                            </span>
                                            {/* An expired membership holds no allowance: `evaluateCloudQuota`
                                                already refuses on `expired`, so printing the lapsed tier's
                                                figure here claimed a limit the user does not have. A scheduled
                                                cancellation still does (`isEntitled`), and keeps its number. */}
                                            <span
                                                className={`text-[16px] font-medium ${summary.isEntitled ? '' : 'text-gray-400'}`}
                                            >
                                                {t('mypage.subscription.maxClouds', {
                                                    count: summary.isEntitled ? currentPlan.maxClouds : 0,
                                                })}
                                            </span>
                                        </div>
                                    )}
                                    {priceOf(currentPlan) && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.price')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {t('mypage.subscription.pricePerMonth', {
                                                    price: priceOf(currentPlan),
                                                })}
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
                                                    ? t('mypage.subscription.platformApple')
                                                    : membership.platform === 'google'
                                                      ? t('mypage.subscription.platformGoogle')
                                                      : membership.platform}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.validFrom ?? 0) > 0 && (membership?.validUntil ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.period')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership?.validFrom)} ~{' '}
                                                {formatDate(membership?.validUntil)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.renewedAt ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.currentPayment')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership?.renewedAt)}
                                            </span>
                                        </div>
                                    )}
                                    {summary.isEntitled && (membership?.validUntil ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.nextPayment')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(membership?.validUntil)}
                                            </span>
                                        </div>
                                    )}
                                    {(membership?.canceledAt ?? 0) > 0 && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.canceledAt')}
                                            </span>
                                            <span className="text-[16px] font-medium text-yellow-600 dark:text-yellow-400">
                                                {formatDate(membership?.canceledAt)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Manage / Restore */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => appBridge.openSubscriptionManagement()}
                                className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground"
                            >
                                {t('mypage.subscription.manageSubscription')}
                            </button>
                            {canRestore && (
                                <button
                                    onClick={() => void restore()}
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

                        {/* Also shown while active: changing tier now happens in-app, not in the
                            store's subscription manager (ADR-0060 §2). */}
                        {isOnMobileApp && (
                            <button
                                onClick={handleViewPlans}
                                className="w-full rounded-full bg-foreground py-3 text-[16px] font-semibold text-background"
                            >
                                {isActive ? t('mypage.subscription.changeTier') : t('mypage.subscription.viewPlans')}
                            </button>
                        )}
                    </>
                ) : (
                    /* Empty state — never subscribed. A scheduled cancellation is NOT this: it still
                       has a running subscription to show, which is what used to land here. */
                    <div className="flex flex-col items-center gap-6 pt-20">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[18px] font-semibold">{t('mypage.subscription.empty')}</span>
                            <span className="text-[15px] text-muted-foreground">
                                {!isOnMobileApp
                                    ? t('mypage.subscription.mobileOnly')
                                    : isGuest
                                      ? t('mypage.subscription.loginRequired')
                                      : t('mypage.subscription.emptyDescription')}
                            </span>
                        </div>
                        <div className="flex w-full gap-2">
                            <button
                                onClick={() => appBridge.openSubscriptionManagement()}
                                className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground"
                            >
                                {t('mypage.subscription.manageSubscription')}
                            </button>
                            {/* Recovers a purchase the store already has but this account's record never picked up
                                (fresh install, reinstall, membership sync gap) — the exact case an empty state hides. */}
                            {canRestore && (
                                <button
                                    onClick={() => void restore()}
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
                        {isOnMobileApp && (
                            <button
                                onClick={handleViewPlans}
                                className="w-full rounded-full bg-foreground py-3 text-[16px] font-semibold text-background"
                            >
                                {isGuest ? t('mypage.subscription.loginCta') : t('mypage.subscription.viewPlans')}
                            </button>
                        )}
                    </div>
                )}

                {/* Notice Section */}
                <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center gap-2 px-1">
                        <AlertCircle size={20} className="flex-shrink-0 text-foreground" />
                        <span className="text-[16px] font-semibold">{t('mypage.subscription.notice.title')}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-1">
                        {[
                            t('mypage.subscription.notice1'),
                            t('mypage.subscription.notice2'),
                            t(`mypage.subscription.notice.manageAt.${managePlatform}`),
                        ].map(text => (
                            <div key={text} className="flex items-start gap-2 px-4 py-1.5">
                                <span className="text-[14px] text-muted-foreground">•</span>
                                <span className="text-[14px] leading-[1.4] tracking-[-0.015em] text-muted-foreground">
                                    {text}
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
                                                    const url = `${POLICY_BASE_URL}/policy/terms`;
                                                    if (isOnMobileApp) {
                                                        appBridge.openURL(url);
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
