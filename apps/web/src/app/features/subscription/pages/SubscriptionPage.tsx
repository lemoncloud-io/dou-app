import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { useNavigateWithTransition } from '@chatic/shared';
import { Button, IconBack, IconButton, IconSpinner, KeyValueRows, ModalTopBar, ScreenLayout } from '@chatic/web-ui-kit';

import { useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import { HeldCloudsBanner, PlanProductCard } from '../components';
import { usePlanCatalog, usePlanPrice, useRestorePurchases } from '../hooks';
import { formatDate, planDisplayName, productStatusWord } from '../lib';
import { useRestoredSignal } from '../stores/useRestoredSignal';

export const SubscriptionPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const sellsInStore = runtime.checkout.kind === 'store';
    const isKo = i18n.language.startsWith('ko');

    const { data: membership, isLoading } = useMembershipInfo();
    const { summary, currentPlan, pendingPlan } = usePlanCatalog();
    const priceOf = usePlanPrice();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { restore, isRestoring, canRestore, notice: webActiveNotice } = useRestorePurchases();
    const observe = useRestoredSignal(s => s.observe);

    useEffect(() => {
        if (!isLoading) observe(summary.state);
    }, [isLoading, summary.state, observe]);

    const hasSubscription = summary.state !== 'none';
    const price = priceOf(currentPlan);
    const word = productStatusWord(summary.state);
    const hasPendingChange = summary.isEntitled && !!summary.pendingProductId;
    const validUntil = formatDate(membership?.validUntil);

    const statusLine = (() => {
        if (summary.state === 'blocked') return t('mypage.subscription.blockedNotice');
        if (summary.state === 'expired') return t('mypage.subscription.list.expiredLine', { date: validUntil });
        if (summary.state === 'cancelScheduled') return t('mypage.subscription.list.endsLine', { date: validUntil });
        if (hasPendingChange) {
            return t('mypage.subscription.list.changeLine', {
                date: validUntil,
                product: planDisplayName(pendingPlan, isKo) ?? summary.pendingProductId,
            });
        }
        if (price && summary.hasLiveReceipt && membership?.autoRenewing !== false) {
            return t('mypage.subscription.banner.autoRenew.description', { date: validUntil, price });
        }
        return undefined;
    })();
    const statusLineTone = summary.state === 'active' ? 'text-point-blue' : 'text-destructive';

    const asksLogin = isGuest && sellsInStore;
    const handleStart = () => (asksLogin ? goToLogin() : navigate(ROUTES.subscription.guide));

    return (
        <ScreenLayout
            className="h-screen"
            header={
                <ModalTopBar
                    safeArea
                    title={t('mypage.subscription.title')}
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
            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                <HeldCloudsBanner />

                {isLoading ? (
                    <div className="flex justify-center pt-20">
                        <IconSpinner className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : hasSubscription ? (
                    <PlanProductCard
                        plan={currentPlan}
                        fallbackName={summary.productId}
                        statusLabel={t(`mypage.subscription.state.${word.key}`)}
                        statusTone={word.tone}
                        entitled={summary.isEntitled}
                        onClick={() => navigate(ROUTES.subscription.detail)}
                    >
                        {(price || statusLine) && (
                            <div className="flex flex-col gap-2 pb-3 pt-1">
                                {price && (
                                    <KeyValueRows
                                        bare
                                        rows={[{ label: t('mypage.subscription.info.price'), value: price }]}
                                    />
                                )}
                                {statusLine && (
                                    <p className={`px-4 text-[14px] font-medium leading-[1.5] ${statusLineTone}`}>
                                        {statusLine}
                                    </p>
                                )}
                            </div>
                        )}
                    </PlanProductCard>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col items-center gap-3 rounded-[18px] bg-card px-4 py-8 shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                            <span
                                aria-hidden
                                className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-[18px] font-bold text-main-accent"
                            >
                                !
                            </span>
                            <span className="text-center text-[17px] font-semibold text-foreground">
                                {t('mypage.subscription.list.emptyTitle')}
                            </span>
                            <span className="text-center text-[14px] text-description">
                                {asksLogin
                                    ? t('mypage.subscription.loginRequired')
                                    : t('mypage.subscription.list.emptyDescription')}
                            </span>
                        </div>
                        <Button size="lg" fullWidth onClick={handleStart}>
                            {asksLogin ? t('mypage.subscription.loginCta') : t('mypage.subscription.subscribe')}
                        </Button>
                    </div>
                )}

                {!isLoading && canRestore && (
                    <button
                        type="button"
                        onClick={() => void restore()}
                        disabled={isRestoring}
                        className="flex items-center justify-center gap-1 self-center py-2 text-[14px] font-medium text-description underline underline-offset-2 disabled:opacity-50"
                    >
                        {isRestoring && <IconSpinner className="size-3.5 animate-spin" />}
                        {t('mypage.subscription.restore')}
                    </button>
                )}
            </div>
            {webActiveNotice}
        </ScreenLayout>
    );
};
