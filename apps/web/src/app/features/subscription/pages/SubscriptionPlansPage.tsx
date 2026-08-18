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

import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import {
    EmailVerifyDialog,
    LoginRequiredDialog,
    PlanCard,
    SubscriptionBenefits,
    TierChangeNotice,
} from '../components';
import { useCloudEmailGuard, usePlanCatalog, usePlanOptions, useTierPurchase } from '../hooks';
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

    const { sellablePlans, summary } = usePlanCatalog();
    const { options, isLoading } = usePlanOptions();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const { isGuest } = useRuntimeProfile();
    const verifyEmail = useCloudEmailGuard();

    const [selected, setSelected] = useState<ProductView | null>(null);
    const [matched, setMatched] = useState<IapProductSubscription | null>(null);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);
    const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);

    const isKo = i18n.language.startsWith('ko');
    const selectedOption = options.find(o => o.plan.id === selected?.id);

    // The entry tier is the only one that carries a trial, and only for a first-time subscriber.
    const trialDays = summary.state === 'none' ? (sellablePlans[0]?.trialDays ?? 0) : 0;
    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    const finish = async (plan: ProductView, native: IapProductSubscription, email?: string) => {
        try {
            await purchaseTier(plan, native, email);
            navigate(ROUTES.subscription.complete);
        } catch (e) {
            const isCancelled = (e as { code?: string })?.code === 'user-cancelled';
            if (!isCancelled) {
                toast({
                    title: t('mypage.subscription.purchaseFailed'),
                    description: e instanceof Error ? e.message : undefined,
                    variant: 'destructive',
                });
            }
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
            // A tier change moves the allowance and creates no cloud — nothing to verify.
            if (!selectedOption.needsEmail) {
                await finish(selected, native);
                return;
            }
            setMatched(native);
            setIsEmailVerifyOpen(true);
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
                                        displayPrice={option.displayPrice}
                                        onSelect={setSelected}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <TierChangeNotice />
                </div>
            </ScreenLayout>

            <LoginRequiredDialog
                open={isLoginPromptOpen}
                onOpenChange={setIsLoginPromptOpen}
                onConfirm={() => {
                    setIsLoginPromptOpen(false);
                    goToLogin();
                }}
            />

            <EmailVerifyDialog
                open={isEmailVerifyOpen}
                onOpenChange={setIsEmailVerifyOpen}
                onVerified={email => selected && matched && finish(selected, matched, email)}
                verifyEmail={verifyEmail}
            />
        </>
    );
};
