import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';

import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

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
import {
    usePlanCatalog,
    usePlanOptions,
    usePlanPrice,
    useRestorePurchases,
    useTierPurchase,
    useWebSubscriptionNotice,
    type PlanOption,
} from '../hooks';
import {
    formatDate,
    keepCandidates,
    isWebSubscriptionActiveError,
    needsKeepChoice,
    planDisplayName,
    stripPlanId,
    type SubscriptionState,
} from '../lib';
import { PageState } from '../types';

interface PurchaseTerms {
    option: PlanOption;
    replaceablePlan: ProductView | undefined;
    state: SubscriptionState;
    trialEligible: boolean;
    keepCandidateCount: number;
}

export const SubscriptionConfirmPage = () => {
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const [params] = useSearchParams();
    const isKo = i18n.language.startsWith('ko');

    const { data: membership } = useMembershipInfo();
    const { summary, replaceablePlan: liveReplaceablePlan, isIOS, sellsInStore, trialEligible } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const priceOf = usePlanPrice();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const { restore, notice: restoreNotice } = useRestorePurchases();
    const { show: showWebActive, notice: webActiveNotice } = useWebSubscriptionNotice();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const requestAddCloud = useAddCloudRequest(s => s.requestAddCloud);

    const [done, setDone] = useState<MembershipView | null>(null);
    const [purchasing, setPurchasing] = useState<PurchaseTerms | null>(null);

    const requested = stripPlanId(params.get('plan'));
    const liveOption = options.find(o => stripPlanId(o.plan.id) === requested);

    if (!isLoading && !purchasing && (!liveOption || !liveOption.isSelectable)) {
        return <Navigate to={ROUTES.subscription.plans} replace />;
    }
    const terms: PurchaseTerms | null =
        purchasing ??
        (liveOption
            ? {
                  option: liveOption,
                  replaceablePlan: liveReplaceablePlan,
                  state: summary.state,
                  trialEligible,
                  keepCandidateCount: keepCandidates(cloudsData?.list ?? []).length,
              }
            : null);
    if (!terms) {
        return (
            <div className="flex h-screen items-center justify-center">
                <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const { option, replaceablePlan } = terms;
    const plan = option.plan;
    const kind = option.kind as 'new' | 'upgrade' | 'downgrade';
    const price = option.displayPrice;
    const productName = planDisplayName(plan, isKo) ?? plan.id ?? '-';
    const currentName = planDisplayName(replaceablePlan, isKo) ?? '-';
    const currentPrice = priceOf(replaceablePlan);
    const trialDays = kind === 'new' && terms.state === 'none' && terms.trialEligible ? (plan.trialDays ?? 0) : 0;
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
        setPurchasing(terms);
        try {
            const native = await resolveNativeProduct(plan);
            setDone(await purchaseTier(plan, native));
        } catch (e) {
            setPurchasing(null);
            const code = (e as { code?: string })?.code;
            if (code === 'user-cancelled') return;
            if (isWebSubscriptionActiveError(e)) {
                logger.warn('IAP', 'purchase refused: web subscription is active', { planId: plan.id });
                showWebActive();
                return;
            }
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
        if (sellsInStore) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const owesKeepChoice = needsKeepChoice(terms.keepCandidateCount, plan.maxClouds);
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

            {webActiveNotice}
            {restoreNotice}

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
