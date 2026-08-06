import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { appBridge } from '../../../bridge';
import { reportError, useProductPlans } from '@chatic/web-core';
import { toError } from '../../../utils/errors';
import { ROUTES } from '../../../routes/paths';

import { useVerifyEmailCode } from '../../../hooks';
import { EmailVerifyDialog } from '../../../ui/components/EmailVerifyDialog';
import { useSubscriptionIap } from '../../subscription/hooks/useSubscriptionIap';
import {
    ALLOWED_PRODUCT_ID_ANDROID,
    ALLOWED_PRODUCT_ID_IOS,
    POLICY_BASE_URL,
    PageState,
    PlanCard,
    PolicyFooter,
    buildPurchaseProduct,
} from './subscription-select';

import type { ProductView } from '@lemoncloud/chatic-backend-api';
import type { IapProductSubscription } from '@chatic/app-messages';

interface SubscriptionSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}

export const SubscriptionSelectDialog = ({
    open,
    onOpenChange,
    onComplete,
    onError,
}: SubscriptionSelectDialogProps) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { isGuest } = useRuntimeProfile();
    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const { fetchNativeProducts, purchaseAndValidate } = useSubscriptionIap();

    const platform = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;
    const { data: plansData, isLoading: isPlansLoading } = useProductPlans(
        platform ? { platform, limit: -1 } : { limit: -1 }
    );
    const allowedProductId = isIOS ? ALLOWED_PRODUCT_ID_IOS : ALLOWED_PRODUCT_ID_ANDROID;
    const plans = (plansData?.list ?? []).filter(p => p.id === allowedProductId);

    const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);
    const [matchedNativeProduct, setMatchedNativeProduct] = useState<IapProductSubscription | null>(null);
    const verifyEmailCode = useVerifyEmailCode();
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);

    const isBlocked = pageState !== PageState.Idle;
    const isKo = i18n.language.startsWith('ko');

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const handleClose = () => {
        if (isBlocked) return;
        setSelectedProduct(null);
        setMatchedNativeProduct(null);
        onOpenChange(false);
    };

    const handleNext = async () => {
        if (!selectedProduct || isBlocked) return;
        // Same guest gate as the plans page: close the sheet and route to login instead of collecting an
        // email for a purchase that has no account to attach to.
        if (isGuest) {
            handleClose();
            navigate(ROUTES.mypage.login);
            return;
        }
        setPageState(PageState.Fetching);
        try {
            const nativeProducts = await fetchNativeProducts();
            const matched = nativeProducts.find(p =>
                isIOS ? p.id === selectedProduct.id?.replace('#', '') : p.basePlanId === selectedProduct.planId
            );
            setMatchedNativeProduct(matched ?? null);
            setIsEmailVerifyOpen(true);
        } finally {
            setPageState(PageState.Idle);
        }
    };

    const handleVerified = async (email: string) => {
        if (!selectedProduct || !matchedNativeProduct) return;
        const product = buildPurchaseProduct(matchedNativeProduct, isIOS);
        if (!product) {
            onError?.(new Error('offerToken is required for Android'));
            return;
        }
        setPageState(PageState.Purchasing);
        try {
            await purchaseAndValidate(product, email);
            onComplete?.();
            handleClose();
        } catch (e) {
            const isCancelled = (e as { code?: string })?.code === 'user-cancelled';
            if (!isCancelled) {
                reportError(toError(e));
                onError?.(e instanceof Error ? e : new Error(String(e)));
            }
        } finally {
            setPageState(PageState.Idle);
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
                                : plans.map(product => (
                                      <PlanCard
                                          key={product.id}
                                          product={product}
                                          isSelected={selectedProduct?.id === product.id}
                                          isBlocked={isBlocked}
                                          isKo={isKo}
                                          onSelect={setSelectedProduct}
                                      />
                                  ))}
                        </div>

                        <PolicyFooter onOpenPolicy={openPolicyUrl} />
                    </div>

                    {/* 하단 버튼 */}
                    <div className="px-6 pb-safe-bottom pt-4">
                        <button
                            onClick={handleNext}
                            disabled={!selectedProduct || isBlocked}
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
                onVerified={handleVerified}
                verifyEmail={verifyEmailCode}
            />
        </>
    );
};
