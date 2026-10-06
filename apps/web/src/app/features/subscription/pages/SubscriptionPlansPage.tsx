import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
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

/**
 * "구독 안내" — the tier picker (Figma 4541-17522 · 4541-17971 · 4550-19003).
 *
 * It only chooses. Confirming the choice — what it costs, when it applies — happens on the next
 * screen, before the store sheet opens; this one never talks to the store. That split is also why
 * this screen reads `usePlanOptions` and not `useTierPurchase`: a second purchase hook here would
 * stand up a second store-result subscription next to the confirm screen's.
 *
 * The adjacency rule is unchanged — a first subscription starts on the entry tier, then one step at
 * a time either way. A refused tier stays tappable and explains itself (`TierRefusalDialog`).
 */
export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t, i18n } = useTranslation();

    const { sellablePlans, summary, currentPlan, replaceablePlan, isOnMobileApp, isIOS } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const [selected, setSelected] = useState<ProductView | null>(null);
    const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
    const [refused, setRefused] = useState<PlanOption | null>(null);

    const isKo = i18n.language.startsWith('ko');
    const alternative = refused ? nearestSelectablePlan(options, refused.plan) : undefined;
    // The entry tier is the only one with a trial, and only for someone who never subscribed.
    const trialDays = summary.state === 'none' ? (sellablePlans[0]?.trialDays ?? 0) : 0;
    const hasCurrent = summary.state !== 'none' && !!currentPlan;
    const currentWord = productStatusWord(summary.state);
    const billingStoreKey = platformLabelKey(replaceablePlan?.platform);

    const handlePick = (option: PlanOption) => {
        if (!option.isSelectable) {
            setRefused(option);
            return;
        }
        setSelected(option.plan);
    };

    const handleNext = () => {
        if (!selected) return;
        // A guest has no account for the receipt to attach to. Ask before sending them away
        // (Figma 2870-33015) rather than yanking them to login mid-decision.
        if (isGuest) {
            setIsLoginPromptOpen(true);
            return;
        }
        navigate(`${ROUTES.subscription.confirm}?plan=${encodeURIComponent(selected.id ?? '')}`);
    };

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
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
                                {isOnMobileApp
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

                    {/* Auto-renewal disclosure + terms/privacy. Both stores require these near the
                        purchase, so they stay on the screen the purchase starts from. */}
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
                    setSelected(plan);
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
