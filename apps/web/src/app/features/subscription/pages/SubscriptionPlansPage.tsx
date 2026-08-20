import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    FloatingButton,
    IconBack,
    IconButton,
    ModalTopBar,
    ScreenLayout,
    myCloudIllustration,
} from '@chatic/web-ui-kit';

import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { appBridge } from '../../../bridge';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import {
    LoginRequiredDialog,
    PlanCard,
    PolicyFooter,
    SubscriptionBenefits,
    TierChangeNotice,
    TierRefusalDialog,
} from '../components';
import { POLICY_BASE_URL } from '../consts';
import { usePlanCatalog, usePlanOptions, useRestorePurchases, useTierPurchase, type PlanOption } from '../hooks';
import { nearestSelectablePlan } from '../lib';
import { PageState } from '../types';

/**
 * "구독 안내" — the single screen a user decides on (Figma 2870-33021).
 *
 * It merges what used to be two: the cloud guide's pitch (why subscribe) and the plan picker (which
 * tier). Splitting them meant the benefits argument sat on a screen the home entry points
 * deliberately skipped (ADR-0034), so half the users never saw it.
 */
export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();

    const { sellablePlans, summary, isOnMobileApp } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const { isGuest } = useRuntimeProfile();
    const { restore: restorePurchases } = useRestorePurchases();

    const [selected, setSelected] = useState<ProductView | null>(null);
    const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
    const [refused, setRefused] = useState<PlanOption | null>(null);

    const isKo = i18n.language.startsWith('ko');
    const selectedOption = options.find(o => o.plan.id === selected?.id);
    // What the refusal dialog can offer instead of the tier that was refused.
    const alternative = refused ? nearestSelectablePlan(options, refused.plan) : undefined;

    // The entry tier is the only one that carries a trial, and only for a first-time subscriber.
    const trialDays = summary.state === 'none' ? (sellablePlans[0]?.trialDays ?? 0) : 0;
    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    // Every card reports its tap, including the ones that cannot be picked (see `PlanCard`): a tier
    // the rules refuse gets the rule stated out loud instead of a tap that goes nowhere.
    const handlePick = (option: PlanOption) => {
        if (!option.isSelectable) {
            setRefused(option);
            return;
        }
        setSelected(option.plan);
    };

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const finish = async (plan: ProductView, native: IapProductSubscription) => {
        try {
            // No email here — a cloud is provisioned without one and gets bound afterward, on home
            // or "구독 관리" (see `EmailRequiredBanner`, `CloudItem`'s unbound-email state). The
            // backend confirmed a cloud reaches `active` with no email at all, so nothing about the
            // purchase itself depends on it.
            await purchaseTier(plan, native);
            navigate(ROUTES.subscription.complete);
        } catch (e) {
            const code = (e as { code?: string })?.code;
            if (code === 'user-cancelled') return;
            // The store already holds an active entitlement this account never got attached to
            // (e.g. a crash or reinstall between the charge and our validation step). That isn't a
            // payment failure, so route it to the same recovery the policy footer's restore button
            // uses instead of the generic "payment failed" toast.
            if (code === 'already-owned') {
                await restorePurchases();
                return;
            }
            toast({
                title: t('mypage.subscription.purchaseFailed'),
                description: e instanceof Error ? e.message : undefined,
                variant: 'destructive',
            });
        }
    };

    const handleSubscribe = async () => {
        if (!selected || !selectedOption || isBlocked) return;
        // A guest has no account for the receipt to attach to. The design asks before sending them
        // away rather than yanking them to login mid-decision (Figma 2870-33015).
        if (isGuest) {
            setIsLoginPromptOpen(true);
            return;
        }
        try {
            const native = await resolveNativeProduct(selected);
            await finish(selected, native);
        } catch (e) {
            toast({
                title: t('mypage.subscription.purchaseFailed'),
                description: e instanceof Error ? e.message : undefined,
                variant: 'destructive',
            });
        }
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
                                onClick={() => !isBlocked && navigate(-1)}
                            />
                        }
                        onClose={() => !isBlocked && navigate(-1)}
                    />
                }
                footer={
                    <FloatingButton
                        label={submitLabel}
                        onClick={() => void handleSubscribe()}
                        disabled={!selected || isBlocked}
                        link={
                            <button
                                type="button"
                                onClick={() => !isBlocked && navigate(-1)}
                                className="text-center text-[15px] font-medium text-muted-foreground"
                            >
                                {t('mypage.subscription.later')}
                            </button>
                        }
                    />
                }
            >
                <div className="flex flex-col gap-8 px-4 pb-6 pt-2">
                    {/* Hero — the trial is the pitch when one is available, the cloud itself otherwise. */}
                    <section className="flex flex-col items-center gap-4 text-center">
                        <h1 className="whitespace-pre-line text-[22px] font-bold leading-[1.35] tracking-[-0.02em] text-foreground">
                            {trialDays > 0 ? (
                                <>
                                    {t('mypage.subscription.hero.trialLead')}
                                    {'\n'}
                                    <span className="text-[#90C304]">
                                        {t('mypage.subscription.hero.trialAccent', { days: trialDays })}
                                    </span>
                                </>
                            ) : (
                                t('mypage.subscription.hero.plain')
                            )}
                        </h1>
                        <p className="whitespace-pre-line text-[14px] leading-[1.5] text-[#78828A]">
                            {trialDays > 0
                                ? t('mypage.subscription.hero.trialSub')
                                : t('mypage.subscription.hero.plainSub')}
                        </p>
                        <img src={myCloudIllustration} alt="" className="size-[160px]" />
                    </section>

                    <SubscriptionBenefits />

                    <section className="flex flex-col gap-3">
                        <h2 className="text-[18px] font-bold leading-[1.35] tracking-[-0.02em] text-foreground">
                            {t('mypage.subscription.pickTitle')}
                        </h2>
                        {isLoading ? (
                            <div className="flex flex-col gap-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="h-[97px] animate-pulse rounded-[16px] bg-muted" />
                                ))}
                            </div>
                        ) : options.length === 0 ? (
                            <span className="py-6 text-center text-[15px] text-muted-foreground">
                                {t('mypage.subscription.noProducts')}
                            </span>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {options.map(option => (
                                    <PlanCard
                                        key={option.plan.id}
                                        product={option.plan}
                                        isSelected={selected?.id === option.plan.id}
                                        isBlocked={isBlocked}
                                        isKo={isKo}
                                        isCurrent={option.isCurrent}
                                        disabledReason={option.disabledReason}
                                        isSelectable={option.isSelectable}
                                        displayPrice={option.displayPrice}
                                        onSelect={() => handlePick(option)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <TierChangeNotice />

                    {/* Auto-renewal disclosure + terms/privacy. Both stores require these next to
                        the purchase, so they belong on this screen and not only in settings. */}
                    <PolicyFooter onOpenPolicy={openPolicyUrl} />
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
