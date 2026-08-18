import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { isNative } from '@chatic/bridges';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { reportError } from '@chatic/web-core';

import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { appBridge } from '../../../bridge';
import { useNavigateToLogin } from '../../auth/hooks';
import { EmailVerifyDialog } from '../../../ui/components/EmailVerifyDialog';
import { toError } from '../../../utils/errors';
import { POLICY_BASE_URL } from '../consts';
import { useCloudEmailGuard, usePlanOptions, useTierPurchase } from '../hooks';
import { PageState } from '../types';
import { PlanCard, PolicyFooter } from './subscription-select';
import { TierChangeNotice } from './TierChangeNotice';

interface SubscriptionSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}

/**
 * Full-screen plan picker opened from the home affordances (ADR-0034 sends them straight here rather
 * than through the cloud guide). Owned by `features/subscription` because it is entirely tier
 * domain — store matching, adjacency, offer tokens (ADR-0060 §6).
 */
export const SubscriptionSelectDialog = ({
    open,
    onOpenChange,
    onComplete,
    onError,
}: SubscriptionSelectDialogProps) => {
    const { t, i18n } = useTranslation();
    const goToLogin = useNavigateToLogin();
    const { isGuest } = useRuntimeProfile();
    const isOnMobileApp = isNative();

    const { options, isLoading: isPlansLoading } = usePlanOptions();
    const { pageState, isBlocked, resolveNativeProduct, purchaseTier } = useTierPurchase();
    const verifyEmail = useCloudEmailGuard();

    const [selected, setSelected] = useState<ProductView | null>(null);
    const [matched, setMatched] = useState<IapProductSubscription | null>(null);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);

    const isKo = i18n.language.startsWith('ko');
    const selectedOption = options.find(o => o.plan.id === selected?.id);

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const handleClose = () => {
        if (isBlocked) return;
        setSelected(null);
        setMatched(null);
        onOpenChange(false);
    };

    const finish = async (product: ProductView, native: IapProductSubscription, email?: string) => {
        try {
            await purchaseTier(product, native, email);
            onComplete?.();
            handleClose();
        } catch (e) {
            const isCancelled = (e as { code?: string })?.code === 'user-cancelled';
            if (!isCancelled) {
                reportError(toError(e));
                onError?.(e instanceof Error ? e : new Error(String(e)));
            }
        }
    };

    const handleNext = async () => {
        if (!selected || !selectedOption || isBlocked) return;
        // Same guest gate as the plans page: route to login rather than collect an email for a
        // purchase that has no account to attach to.
        if (isGuest) {
            handleClose();
            goToLogin();
            return;
        }
        try {
            const native = await resolveNativeProduct(selected);
            // A tier change moves the allowance; it creates no cloud, so there is no email to verify.
            if (!selectedOption.needsEmail) {
                await finish(selected, native);
                return;
            }
            setMatched(native);
            setIsEmailVerifyOpen(true);
        } catch (e) {
            onError?.(e instanceof Error ? e : new Error(String(e)));
        }
    };

    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    return (
        <>
            <Dialog open={open} onOpenChange={open => !open && handleClose()}>
                <DialogContent
                    className="flex h-full max-w-none flex-col overflow-hidden rounded-none p-0 sm:rounded-none"
                    hideClose
                >
                    <DialogTitle className="sr-only">{t('mypage.subscription.plans')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('mypage.subscription.plans')}</DialogDescription>

                    {/* 헤더 */}
                    <div className="flex items-center justify-between px-6 pb-0 pt-6 pt-safe-top">
                        <h2 className="text-[20px] font-bold">{t('mypage.subscription.plans')}</h2>
                        <button
                            onClick={handleClose}
                            disabled={isBlocked}
                            className={cn('rounded-full p-1', isBlocked && 'opacity-30')}
                        >
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    {/* 스크롤 영역 */}
                    <div className="flex-1 overflow-y-auto px-6">
                        <div className="flex flex-col gap-3 pt-4">
                            {isPlansLoading
                                ? Array.from({ length: 3 }).map((_, i) => (
                                      <div key={i} className="h-[80px] animate-pulse rounded-[16px] bg-muted" />
                                  ))
                                : options.map(option => (
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

                        {selectedOption && <TierChangeNotice kind={selectedOption.kind} />}

                        <PolicyFooter onOpenPolicy={openPolicyUrl} />
                    </div>

                    {/* 하단 버튼 */}
                    <div className="px-6 pb-safe-bottom pt-4">
                        <button
                            onClick={handleNext}
                            disabled={!selected || isBlocked}
                            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[16px] font-semibold text-background disabled:opacity-40"
                        >
                            {isBlocked && <Loader2 size={18} className="animate-spin" />}
                            {submitLabel}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            <EmailVerifyDialog
                open={isEmailVerifyOpen}
                onOpenChange={setIsEmailVerifyOpen}
                onVerified={email => selected && matched && finish(selected, matched, email)}
                verifyEmail={verifyEmail}
            />
        </>
    );
};
