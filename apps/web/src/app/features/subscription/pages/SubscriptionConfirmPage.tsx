import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    FloatingButton,
    IconBack,
    IconButton,
    IconSpinner,
    KeyValueRows,
    ModalTopBar,
    ScreenLayout,
    type KeyValueRow,
} from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { NoticeList, PlanProductCard, PolicyFooter, PurchaseDoneDialog } from '../components';
import { POLICY_BASE_URL } from '../consts';
import { usePlanCatalog, usePlanOptions, usePlanPrice, useRestorePurchases, useTierPurchase } from '../hooks';
import { formatDate, keepCandidates, needsKeepChoice, planDisplayName, stripPlanId } from '../lib';
import { PageState } from '../types';

/**
 * "구독 정보" before a purchase — what a tier change will do, shown BEFORE the store sheet opens
 * (Figma 4538-16298 upgrade · 4550-19299 downgrade, with the processing overlay 4541-18396 ·
 * 4554-20219 and the completion 4541-18323 · 4554-19998).
 *
 * The plan picker only chooses; this screen states the consequence — current plan against the new
 * one, when it applies, what will be charged — and is the only screen that opens the store. A
 * downgrade waits for the next renewal and an upgrade applies now, and that asymmetry has to be
 * read here, not discovered on a receipt. The first purchase uses the upgrade layout without a
 * "current plan" row; the design draws no separate scene for it.
 *
 * The store-result subscription (`useTierPurchase` → `useSubscriptionIap`) lives on this screen and
 * nowhere else in the flow, so there is exactly one listener for the purchase answer.
 */
export const SubscriptionConfirmPage = () => {
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const [params] = useSearchParams();
    const isKo = i18n.language.startsWith('ko');

    const { data: membership } = useMembershipInfo();
    const { summary, replaceablePlan, isIOS, isOnMobileApp } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const priceOf = usePlanPrice();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const { restore } = useRestorePurchases();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const requestAddCloud = useAddCloudRequest(s => s.requestAddCloud);

    const [done, setDone] = useState<MembershipView | null>(null);

    const requested = stripPlanId(params.get('plan'));
    const option = options.find(o => stripPlanId(o.plan.id) === requested);

    // A missing, unknown or unpickable plan (a stale link, a tier that changed under the user) sends
    // them back to choose again rather than offering a purchase the rules refuse.
    if (!isLoading && !done && (!option || !option.isSelectable)) {
        return <Navigate to={ROUTES.subscription.plans} replace />;
    }
    if (!option) {
        return (
            <div className="flex h-screen items-center justify-center">
                <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const plan = option.plan;
    const kind = option.kind as 'new' | 'upgrade' | 'downgrade';
    const price = option.displayPrice;
    const productName = planDisplayName(plan, isKo) ?? plan.id ?? '-';
    const currentName = planDisplayName(replaceablePlan, isKo) ?? '-';
    const currentPrice = priceOf(replaceablePlan);
    // Only the entry tier for someone who never subscribed carries a trial; the store has the last
    // word on eligibility either way.
    const trialDays = kind === 'new' && summary.state === 'none' ? (plan.trialDays ?? 0) : 0;
    const validUntil = formatDate(membership?.validUntil);
    const isProcessing = pageState === PageState.Purchasing || pageState === PageState.Fetching;

    const rows: Array<KeyValueRow | false> =
        kind === 'new'
            ? [
                  !!price && {
                      key: 'scheduledPrice',
                      label: t('mypage.subscription.info.scheduledPrice'),
                      value: price,
                      tone: 'accent',
                  },
              ]
            : [
                  {
                      key: 'current',
                      label: t('mypage.subscription.info.current'),
                      value: currentName,
                      hint: currentPrice,
                  },
                  { key: 'next', label: t('mypage.subscription.info.next'), value: productName, hint: price },
                  ...(kind === 'downgrade'
                      ? [
                            { key: 'applyOn', label: t('mypage.subscription.info.applyOn'), value: validUntil },
                            { key: 'chargeOn', label: t('mypage.subscription.info.chargeOn'), value: validUntil },
                        ]
                      : [
                            {
                                key: 'period',
                                label: t('mypage.subscription.info.period'),
                                value: `${formatDate(membership?.validFrom)}~${validUntil}`,
                            },
                        ]),
                  !!price && {
                      key: 'scheduledPrice',
                      label: t('mypage.subscription.info.scheduledPrice'),
                      value: price,
                      tone: 'accent',
                  },
              ];

    // Upgrade billing differs by store and the wording has to say which: Apple refunds the unused
    // part and charges in full, resetting the renewal date; Google charges the difference and keeps
    // the cycle.
    const upgradeNotices = [
        t(`mypage.subscription.confirm.upgrade${isIOS ? 'Apple' : 'Google'}1`, {
            product: productName,
            current: currentName,
        }),
        t(`mypage.subscription.confirm.upgrade${isIOS ? 'Apple' : 'Google'}2`),
    ];
    const notices =
        kind === 'upgrade'
            ? upgradeNotices
            : kind === 'downgrade'
              ? [
                    t('mypage.subscription.notice.upgradeImmediate'),
                    t('mypage.subscription.notice.downgradeNextRenewal'),
                    t(`mypage.subscription.notice.manageAt.${isIOS ? 'apple' : 'google'}`),
                ]
              : [
                    ...(price && trialDays > 0 ? [t('mypage.subscription.complete.autoChargeAfter', { price })] : []),
                    t('mypage.subscription.complete.cancelAnytime'),
                ];

    const ctaLabel =
        kind === 'downgrade'
            ? t('mypage.subscription.confirm.reserve')
            : trialDays > 0
              ? t('mypage.subscription.cloudGuide.ctaWithTrial', { days: trialDays })
              : t('mypage.subscription.subscribe');

    const handleBuy = async () => {
        if (isBlocked || !price) return;
        try {
            const native = await resolveNativeProduct(plan);
            setDone(await purchaseTier(plan, native));
        } catch (e) {
            const code = (e as { code?: string })?.code;
            if (code === 'user-cancelled') return;
            // The store already holds an entitlement this account never got attached to — recover
            // it the way the restore button does instead of reporting a payment failure.
            if (code === 'already-owned') {
                logger.warn('IAP', 'purchase already owned; restoring', { planId: plan.id });
                await restore();
                return;
            }
            toast({
                title: t('mypage.subscription.purchaseFailed'),
                description: e instanceof Error ? e.message : undefined,
                variant: 'destructive',
            });
        }
    };

    const leave = () => navigate(ROUTES.subscription.detail, { replace: true });

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    // After a downgrade the clouds that will not fit have to be chosen; after a purchase the new
    // allowance is there to be used. The cloud count is read now, before the relay has applied
    // anything, which is the number the choice is about.
    const owesKeepChoice = needsKeepChoice(keepCandidates(cloudsData?.list ?? []).length, plan.maxClouds);
    const primary =
        kind === 'downgrade'
            ? owesKeepChoice
                ? {
                      label: t('mypage.subscription.detail.keepPick'),
                      onClick: () =>
                          navigate(`${ROUTES.subscription.keep}?plan=${encodeURIComponent(plan.id ?? '')}`, {
                              replace: true,
                          }),
                  }
                : undefined
            : {
                  label: t('mypage.subscription.done.addCloud'),
                  onClick: () => {
                      leave();
                      requestAddCloud();
                  },
              };

    return (
        <>
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
                                onClick={() => !isBlocked && navigate(-1)}
                            />
                        }
                    />
                }
                footer={
                    <FloatingButton label={ctaLabel} onClick={() => void handleBuy()} disabled={!price || isBlocked} />
                }
            >
                <div className="flex flex-col gap-6 pb-6 pt-2">
                    {kind === 'downgrade' && (
                        <div className="flex flex-col gap-2 px-4 pt-4">
                            <h1 className="whitespace-pre-line text-[20px] font-semibold leading-[1.35] text-foreground">
                                {t('mypage.subscription.confirm.downgradeHeadline')}
                            </h1>
                            <p className="text-[14px] font-medium leading-[1.45] text-point-blue">
                                {t('mypage.subscription.confirm.downgradeDescription', {
                                    date: validUntil,
                                    product: productName,
                                })}
                            </p>
                        </div>
                    )}

                    <section className="flex flex-col gap-2">
                        <h2 className="px-4 py-2 text-[16px] font-semibold text-foreground">
                            {t('mypage.subscription.confirm.selected')}
                        </h2>
                        <div className="px-4">
                            <PlanProductCard plan={plan} />
                        </div>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="px-4 py-2 text-[16px] font-semibold text-foreground">
                            {t('mypage.subscription.detail.infoTitle')}
                        </h2>
                        <div className="px-4">
                            <KeyValueRows rows={rows.filter((row): row is KeyValueRow => !!row)} />
                        </div>
                        {!price && (
                            <p className="px-4 text-[13px] text-destructive">
                                {t('mypage.subscription.confirm.unavailable')}
                            </p>
                        )}
                    </section>

                    <NoticeList items={notices} />

                    <div className="px-4">
                        <PolicyFooter onOpenPolicy={openPolicyUrl} />
                    </div>
                </div>
            </ScreenLayout>

            {/* The store sheet sits on top while this shows; the overlay is what remains once it
                closes and the receipt is being validated. Fixed to the viewport on purpose — it
                blocks the whole screen, not the column. */}
            {isProcessing && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/50"
                >
                    <IconSpinner className="size-9 animate-spin text-white" />
                    <span className="text-[16px] font-semibold text-white">
                        {t('mypage.subscription.confirm.processing')}
                    </span>
                </div>
            )}

            <PurchaseDoneDialog
                membership={done}
                kind={kind}
                productName={productName}
                price={price}
                isTrial={trialDays > 0}
                notices={kind === 'upgrade' ? upgradeNotices : []}
                primary={primary}
                onDone={leave}
            />
        </>
    );
};
