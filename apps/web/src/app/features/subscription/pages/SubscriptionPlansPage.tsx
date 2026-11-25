import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';
import { FloatingButton, IconBack, IconButton, ModalTopBar, ScreenLayout } from '@chatic/web-ui-kit';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { appBridge } from '../../../bridge';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import {
    LoginRequiredDialog,
    NoticeList,
    PlanCard,
    PlanProductCard,
    PolicyFooter,
    TierRefusalDialog,
} from '../components';
import { POLICY_BASE_URL } from '../consts';
import { usePlanCatalog, usePlanOptions, type PlanOption } from '../hooks';
import { nearestSelectablePlan, platformLabelKey, productStatusWord } from '../lib';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t, i18n } = useTranslation();

    const {
        sellablePlans,
        summary,
        currentPlan,
        replaceablePlan,
        resubscribePlan,
        sellsInStore,
        isIOS,
        trialEligible,
    } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const [picked, setPicked] = useState<ProductView | null>(null);
    const selected = picked ?? resubscribePlan ?? null;
    const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
    const [refused, setRefused] = useState<PlanOption | null>(null);

    const isKo = i18n.language.startsWith('ko');
    const alternative = refused ? nearestSelectablePlan(options, refused.plan) : undefined;
    const trialDays = summary.state === 'none' && trialEligible ? (sellablePlans[0]?.trialDays ?? 0) : 0;
    const hasCurrent = summary.state !== 'none' && !!currentPlan;
    const currentWord = productStatusWord(summary.state);
    const billingStoreKey = platformLabelKey(replaceablePlan?.platform);

    const handlePick = (option: PlanOption) => {
        if (!option.isSelectable) {
            setRefused(option);
            return;
        }
        setPicked(option.plan);
    };

    const handleNext = () => {
        if (!selected) return;
        if (isGuest) {
            setIsLoginPromptOpen(true);
            return;
        }
        navigate(`${ROUTES.subscription.confirm}?plan=${encodeURIComponent(selected.id ?? '')}`);
    };

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (sellsInStore) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    return (
        <>
            <ScreenLayout
                className="h-screen"
                header={
                    <ModalTopBar
                        safeArea
                        title={t('mypage.subscription.guideTitle')}
                        leftSlot={
                            <IconButton
                                icon={<IconBack className="size-[26px]" />}
                                label={t('common.back')}
                                onClick={() => navigate(-1)}
                            />
                        }
                    />
                }
                footer={
                    <FloatingButton
                        label={t('mypage.subscription.picker.next')}
                        onClick={handleNext}
                        disabled={!selected}
                    />
                }
            >
                <div className="flex flex-col gap-6 pb-6 pt-2">
                    {hasCurrent && (
                        <section className="flex flex-col gap-2">
                            <h2 className="px-4 py-2 text-[16px] font-semibold text-foreground">
                                {t('mypage.subscription.currentPlan')}
                            </h2>
                            <div className="px-4">
                                <PlanProductCard
                                    plan={currentPlan}
                                    statusLabel={t(`mypage.subscription.state.${currentWord.key}`)}
                                    statusTone={currentWord.tone}
                                    entitled={summary.isEntitled}
                                />
                            </div>
                        </section>
                    )}

                    <section className="flex flex-col gap-3 px-4">
                        <div className="flex flex-col gap-1 py-2">
                            <h2 className="text-[16px] font-semibold text-foreground">
                                {t('mypage.subscription.picker.productsTitle')}
                            </h2>
                            <p className="whitespace-pre-line text-[14px] leading-[1.45] text-description">
                                {t('mypage.subscription.picker.intro')}
                            </p>
                        </div>
                        {isLoading ? (
                            <div className="flex flex-col gap-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="h-[97px] animate-pulse rounded-[16px] bg-muted" />
                                ))}
                            </div>
                        ) : options.length === 0 ? (
                            <span className="py-6 text-center text-[15px] text-muted-foreground">
                                {sellsInStore
                                    ? t('mypage.subscription.noProducts')
                                    : t('mypage.subscription.mobileOnly')}
                            </span>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {options.map(option => (
                                    <PlanCard
                                        key={option.plan.id}
                                        product={option.plan}
                                        isSelected={selected?.id === option.plan.id}
                                        isBlocked={false}
                                        isKo={isKo}
                                        isCurrent={option.isCurrent}
                                        disabledReason={option.disabledReason}
                                        isSelectable={option.isSelectable}
                                        displayPrice={option.displayPrice}
                                        trialDays={(option.plan.sort ?? 0) === 1 ? trialDays : 0}
                                        onSelect={() => handlePick(option)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <NoticeList
                        items={[
                            t('mypage.subscription.notice.upgradeImmediate'),
                            t('mypage.subscription.notice.downgradeNextRenewal'),
                            t(`mypage.subscription.notice.manageAt.${isIOS ? 'apple' : 'google'}`),
                        ]}
                    />

                    <div className="px-4">
                        <PolicyFooter onOpenPolicy={openPolicyUrl} />
                    </div>
                </div>
            </ScreenLayout>

            <TierRefusalDialog
                refusal={refused?.refusal ?? null}
                onOpenChange={open => !open && setRefused(null)}
                alternative={alternative?.plan}
                onPickAlternative={plan => {
                    setPicked(plan);
                    setRefused(null);
                }}
                isKo={isKo}
                store={billingStoreKey ? t(billingStoreKey) : undefined}
            />

            <LoginRequiredDialog
                open={isLoginPromptOpen}
                onOpenChange={setIsLoginPromptOpen}
                onConfirm={() => {
                    setIsLoginPromptOpen(false);
                    goToLogin();
                }}
            />
        </>
    );
};
