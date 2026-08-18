import { ChevronLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { appBridge } from '../../../bridge';
import { useNavigateToLogin } from '../../auth/hooks';
import { EmailVerifyDialog } from '../../../ui/components/EmailVerifyDialog';
import { PlanCard, PolicyFooter, TierChangeNotice } from '../components';
import { POLICY_BASE_URL } from '../consts';
import { useCloudEmailGuard, usePlanCatalog, usePlanOptions, useTierPurchase } from '../hooks';
import { PageState } from '../types';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();

    const { isOnMobileApp } = usePlanCatalog();
    const { options, isLoading: isPlansLoading } = usePlanOptions();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const { isGuest } = useRuntimeProfile();
    const verifyEmail = useCloudEmailGuard();

    const [selected, setSelected] = useState<ProductView | null>(null);
    const [matched, setMatched] = useState<IapProductSubscription | null>(null);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);

    const isKo = i18n.language.startsWith('ko');
    const selectedOption = options.find(o => o.plan.id === selected?.id);
    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const finish = async (plan: ProductView, native: IapProductSubscription, email?: string) => {
        try {
            await purchaseTier(plan, native, email);
            toast({
                title: t('mypage.subscription.purchaseSuccess'),
                description: t('mypage.subscription.purchaseSuccessDescription'),
            });
            await new Promise(resolve => setTimeout(resolve, 1500));
            navigate(-1);
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
        // A guest session has no account for the receipt to attach to, so send them to login before
        // the email step rather than after.
        if (isGuest) {
            goToLogin();
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
            <div className="flex h-screen flex-col bg-background">
                <header className="flex items-center px-[6px] pt-safe-top">
                    <button onClick={() => !isBlocked && navigate(-1)} className="rounded-full p-[9px]">
                        <ChevronLeft size={26} strokeWidth={2} className={cn(isBlocked && 'opacity-30')} />
                    </button>
                    <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.subscription.plans')}</h1>
                    <div className="w-[44px]" />
                </header>

                <div className="flex flex-1 flex-col overflow-y-auto p-4">
                    {isPlansLoading ? (
                        <div className="flex flex-col gap-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-[80px] animate-pulse rounded-[16px] bg-muted" />
                            ))}
                        </div>
                    ) : options.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center">
                            <span className="text-[15px] text-muted-foreground">
                                {t('mypage.subscription.noProducts')}
                            </span>
                        </div>
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
                                    onSelect={setSelected}
                                />
                            ))}
                        </div>
                    )}

                    {options.length > 0 && (
                        <div className="mt-auto pb-safe-bottom pt-6">
                            {selectedOption && <TierChangeNotice kind={selectedOption.kind} />}
                            <PolicyFooter onOpenPolicy={openPolicyUrl} />
                            <button
                                onClick={handleSubscribe}
                                disabled={!selected || isBlocked}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[16px] font-semibold text-background disabled:opacity-40"
                            >
                                {isBlocked && <Loader2 size={18} className="animate-spin" />}
                                {submitLabel}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <EmailVerifyDialog
                open={isEmailVerifyOpen}
                onOpenChange={setIsEmailVerifyOpen}
                onVerified={email => selected && matched && finish(selected, matched, email)}
                verifyEmail={verifyEmail}
            />
        </>
    );
};
