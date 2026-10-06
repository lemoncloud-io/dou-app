import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { Lock, ShieldAlert } from 'lucide-react';

import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    Button,
    IconBack,
    IconButton,
    IconCheckCircleSolid,
    IconChevronRight,
    IconClockSolid,
    IconSpinner,
    KeyValueRows,
    ModalTopBar,
    ScreenLayout,
    StatusBanner,
    type KeyValueRow,
} from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import { NoticeList, PlanProductCard } from '../components';
import { usePlanCatalog, usePlanPrice } from '../hooks';
import {
    daysUntil,
    deriveBanner,
    deriveInfoRows,
    formatDate,
    hasDropMarks,
    isWithinExpiredHold,
    keepCandidates,
    needsKeepChoice,
    planDisplayName,
    platformLabelKey,
    productStatusWord,
    subscriptionStatusWord,
    type InfoRow,
} from '../lib';
import { useRestoredSignal } from '../stores/useRestoredSignal';

/** The navy the status banner icons carry in the design — no token, the same as the banner title. */
const BANNER_ICON = 'size-6 shrink-0 text-[#1C274C] dark:text-foreground';

const SectionTitle = ({ children }: { children: string }) => (
    <h2 className="px-4 py-2 text-[16px] font-semibold leading-[18px] tracking-[-0.08px] text-foreground">
        {children}
    </h2>
);

/**
 * "구독 정보" — the running subscription in detail (Figma 4666-42489 and the banner variants
 * 4476-77853 · 4522-14249 · 4522-14495 · 4523-14812, the queued downgrade 4556-20993 · 4564-22624).
 *
 * Every value comes from the membership and the store price; the app computes no amount. The one
 * banner on top is `deriveBanner`'s choice, and tapping it opens the store's own subscription
 * management — the design notes say so, and it is where an ending is undone.
 *
 * Two designed variants are not drawn: the payment-failure banner (the relay has no grace-period
 * signal to show it from) and the refunded amount (the membership carries no amounts at all).
 */
export const SubscriptionDetailPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const isOnMobileApp = isNative();
    const isKo = i18n.language.startsWith('ko');

    const { data: membership, isLoading } = useMembershipInfo();
    const { summary, currentPlan, pendingPlan, isIOS } = usePlanCatalog();
    const priceOf = usePlanPrice();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const { observe, restored, dismiss } = useRestoredSignal();

    useEffect(() => {
        if (!isLoading) observe(summary.state);
    }, [isLoading, summary.state, observe]);
    // The restored note is news once. Leaving the screen spends it.
    useEffect(() => () => dismiss(), [dismiss]);

    if (!isLoading && summary.state === 'none') return <Navigate to={ROUTES.subscription.root} replace />;

    const now = Date.now();
    const price = priceOf(currentPlan);
    const hasPendingChange = summary.isEntitled && !!summary.pendingProductId;
    const validUntil = formatDate(membership?.validUntil);
    const banner = deriveBanner({ summary, autoRenewing: membership?.autoRenewing, hasPrice: !!price, restored });
    const openStore = isOnMobileApp ? () => appBridge.openSubscriptionManagement() : undefined;
    // Where to manage it is the store it was bought on, not this device's — fall back to the device
    // only when the membership does not say.
    const storeKey = membership?.platform === 'google' || (!membership?.platform && !isIOS) ? 'google' : 'apple';

    const candidates = keepCandidates(cloudsData?.list ?? []);
    const owesKeepChoice = hasPendingChange && needsKeepChoice(candidates.length, pendingPlan?.maxClouds);

    const productWord = productStatusWord(summary.state);
    const statusWord = subscriptionStatusWord(summary.state, hasPendingChange);

    const rowFor = (row: InfoRow): KeyValueRow | undefined => {
        const label = t(`mypage.subscription.info.${row}`);
        switch (row) {
            case 'status':
                return {
                    key: row,
                    label,
                    value: t(`mypage.subscription.state.${statusWord.key}`),
                    tone: statusWord.tone === 'danger' ? 'danger' : 'info',
                };
            case 'price':
                return price ? { key: row, label, value: price } : undefined;
            case 'period':
                return membership?.validFrom && membership?.validUntil
                    ? { key: row, label, value: `${formatDate(membership.validFrom)}~${validUntil}` }
                    : undefined;
            case 'nextPayment':
            case 'endsOn':
            case 'expiredOn':
                return membership?.validUntil ? { key: row, label, value: validUntil } : undefined;
            case 'scheduledPrice':
                return price ? { key: row, label, value: price, tone: 'accent' } : undefined;
            case 'platform': {
                const platformKey = platformLabelKey(membership?.platform);
                return platformKey ? { key: row, label, value: t(platformKey) } : undefined;
            }
            case 'adminGrant':
                return {
                    key: row,
                    label,
                    value:
                        (membership?.adminUntil ?? 0) > 0
                            ? `~ ${formatDate(membership?.adminUntil)}`
                            : t('mypage.subscription.adminGrantIndefinite'),
                };
        }
    };
    const infoRows = deriveInfoRows(summary.state, hasPendingChange, !!summary.isAdminOverridden)
        .map(rowFor)
        .filter((row): row is KeyValueRow => !!row);

    const bannerNode = (() => {
        switch (banner) {
            case 'blocked':
                return (
                    <StatusBanner
                        icon={<ShieldAlert className={BANNER_ICON} />}
                        title={t('mypage.subscription.banner.blocked.title')}
                        description={t('mypage.subscription.blockedNotice')}
                        tone="danger"
                        onClick={openStore}
                    />
                );
            case 'expired':
                return (
                    <StatusBanner
                        icon={<Lock className={BANNER_ICON} />}
                        title={t('mypage.subscription.banner.expired.title')}
                        description={
                            // "Your clouds come back" is only true while the relay still holds them.
                            isWithinExpiredHold(membership?.validUntil, now)
                                ? t('mypage.subscription.banner.expired.description')
                                : t('mypage.subscription.banner.expired.descriptionPastHold')
                        }
                        tone="danger"
                        onClick={openStore}
                    />
                );
            case 'cancelScheduled': {
                const days = daysUntil(membership?.validUntil, now);
                return (
                    <StatusBanner
                        icon={<IconClockSolid className={BANNER_ICON} />}
                        title={t('mypage.subscription.banner.ending.title')}
                        description={t('mypage.subscription.banner.ending.description', { date: validUntil })}
                        tone="danger"
                        chip={days ? t('mypage.subscription.banner.ending.chip', { days }) : undefined}
                        onClick={openStore}
                    />
                );
            }
            case 'restored':
                return (
                    <StatusBanner
                        icon={<IconCheckCircleSolid className={BANNER_ICON} />}
                        title={t('mypage.subscription.banner.restored.title')}
                        description={t('mypage.subscription.banner.restored.description')}
                        onClick={openStore}
                    />
                );
            case 'autoRenew':
                return (
                    <StatusBanner
                        icon={<IconClockSolid className={BANNER_ICON} />}
                        title={t('mypage.subscription.banner.autoRenew.title')}
                        description={t('mypage.subscription.banner.autoRenew.description', {
                            date: validUntil,
                            price,
                        })}
                        onClick={openStore}
                    />
                );
            default:
                return null;
        }
    })();

    const currentCard = (
        <PlanProductCard
            plan={currentPlan}
            fallbackName={summary.productId}
            statusLabel={t(`mypage.subscription.state.${productWord.key}`)}
            statusTone={productWord.tone}
            entitled={summary.isEntitled}
        />
    );

    return (
        <ScreenLayout
            className="h-screen"
            header={
                <ModalTopBar
                    safeArea
                    title={t('mypage.subscription.detail.title')}
                    leftSlot={
                        <IconButton
                            icon={<IconBack className="size-[26px]" />}
                            label={t('common.back')}
                            onClick={() => navigate(-1)}
                        />
                    }
                />
            }
        >
            {isLoading ? (
                <div className="flex justify-center pt-20">
                    <IconSpinner className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="flex flex-col gap-6 pb-8 pt-2">
                    {hasPendingChange && (
                        <section className="flex flex-col gap-2">
                            <SectionTitle>{t('mypage.subscription.detail.pendingTitle')}</SectionTitle>
                            <div className="px-4">
                                <PlanProductCard
                                    plan={pendingPlan}
                                    fallbackName={summary.pendingProductId}
                                    statusLabel={t('mypage.subscription.state.scheduled')}
                                    statusTone="scheduled"
                                >
                                    <div className="flex flex-col gap-2 pb-4 pt-3">
                                        <div className="flex items-center gap-2 px-4">
                                            <IconClockSolid className={BANNER_ICON} />
                                            <span className="flex-1 text-[16px] font-semibold leading-[1.44] text-foreground">
                                                {t('mypage.subscription.detail.pendingHeader')}
                                            </span>
                                        </div>
                                        <p className="px-4 text-[14px] font-medium leading-[1.5] text-point-blue">
                                            {t('mypage.subscription.detail.pendingDescription', {
                                                date: validUntil,
                                                product: planDisplayName(pendingPlan, isKo) ?? summary.pendingProductId,
                                            })}
                                        </p>
                                        <KeyValueRows
                                            bare
                                            rows={[
                                                {
                                                    key: 'applyOn',
                                                    label: t('mypage.subscription.info.applyOn'),
                                                    value: validUntil,
                                                },
                                                {
                                                    key: 'chargeOn',
                                                    label: t('mypage.subscription.info.chargeOn'),
                                                    value: validUntil,
                                                },
                                                ...(priceOf(pendingPlan)
                                                    ? [
                                                          {
                                                              key: 'scheduledPrice',
                                                              label: t('mypage.subscription.info.scheduledPrice'),
                                                              value: priceOf(pendingPlan) as string,
                                                              tone: 'accent' as const,
                                                          },
                                                      ]
                                                    : []),
                                                ...infoRows.filter(row => row.key === 'platform'),
                                            ]}
                                        />
                                        {owesKeepChoice && (
                                            <div className="px-4 pt-1">
                                                <Button
                                                    tone="black"
                                                    size="lg"
                                                    fullWidth
                                                    className="justify-between"
                                                    trailingIcon={<IconChevronRight className="size-5" />}
                                                    onClick={() => navigate(ROUTES.subscription.keep)}
                                                >
                                                    {hasDropMarks(candidates)
                                                        ? t('mypage.subscription.detail.keepReview')
                                                        : t('mypage.subscription.detail.keepPick')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </PlanProductCard>
                            </div>
                        </section>
                    )}

                    <section className="flex flex-col gap-2">
                        <SectionTitle>{t('mypage.subscription.currentPlan')}</SectionTitle>
                        <div className="flex flex-col gap-4 px-4">
                            {bannerNode}
                            {currentCard}
                            {/* Only when both the plan and the receipt back it (`resolveTrialDaysLeft`). */}
                            {summary.trialDaysLeft != null && (
                                <span className="self-start rounded-full bg-primary/20 px-3 py-1 text-[13px] font-semibold text-main-accent">
                                    {t('mypage.subscription.trialRemaining', { days: summary.trialDaysLeft })}
                                </span>
                            )}
                        </div>
                    </section>

                    <section className="flex flex-col gap-2">
                        <SectionTitle>{t('mypage.subscription.detail.infoTitle')}</SectionTitle>
                        <div className="px-4">
                            <KeyValueRows rows={infoRows} />
                        </div>
                    </section>

                    <div className="flex flex-col gap-4 px-4">
                        {isOnMobileApp ? (
                            <>
                                {summary.state !== 'blocked' && (
                                    <Button size="lg" fullWidth onClick={() => navigate(ROUTES.subscription.plans)}>
                                        {summary.state === 'expired'
                                            ? t('mypage.subscription.detail.resubscribe')
                                            : t('mypage.subscription.detail.changePlan')}
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="lg"
                                    fullWidth
                                    onClick={() => appBridge.openSubscriptionManagement()}
                                >
                                    {t('mypage.subscription.detail.manageInStore')}
                                </Button>
                            </>
                        ) : (
                            <p className="text-center text-[14px] text-description">
                                {t('mypage.subscription.mobileOnly')}
                            </p>
                        )}
                    </div>

                    <NoticeList
                        items={[
                            t('mypage.subscription.notice.upgradeImmediate'),
                            t('mypage.subscription.notice.downgradeNextRenewal'),
                            t(`mypage.subscription.notice.manageAt.${storeKey}`),
                        ]}
                    />
                </div>
            )}
        </ScreenLayout>
    );
};
