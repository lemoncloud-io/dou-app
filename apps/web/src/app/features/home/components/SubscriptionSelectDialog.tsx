import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { getMobileAppInfo, postMessage } from '@chatic/app-messages';
import { reportError, toError } from '@chatic/web-core';
import { useProductPlans } from '@chatic/subscriptions';

import { EmailVerifyDialog } from './EmailVerifyDialog';
import { useSubscriptionIap } from '../../mypage/hooks/useSubscriptionIap';

import type { ProductView } from '@lemoncloud/chatic-backend-api';
import type { IapProductSubscription } from '@chatic/app-messages';
import type { PurchaseProduct } from '../../mypage/hooks/useSubscriptionIap';

enum PageState {
    Idle = 'idle',
    Fetching = 'fetching',
    Purchasing = 'purchasing',
}

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
const POLICY_BASE_URL = IS_DEV ? 'https://app-dev.chatic.io' : 'https://app.chatic.io';
// TODO: 추후 서버에서 노출할 상품 목록을 관리하는 방식으로 변경 예정
const ALLOWED_PRODUCT_ID_IOS = IS_DEV ? '#pro_tier_01_dev' : '#pro_tier_01';
const ALLOWED_PRODUCT_ID_ANDROID = IS_DEV ? '#pro-tier-01-dev' : '#pro-tier-01';

const buildPurchaseProduct = (matched: IapProductSubscription, isIOS: boolean): PurchaseProduct | null => {
    const offerToken = matched.androidOfferToken?.freeTrial ?? matched.androidOfferToken?.base ?? undefined;
    if (!isIOS && !offerToken) return null;
    return isIOS
        ? {
              id: matched.id,
              ...(matched.basePlanId && { newPlanId: matched.basePlanId }),
          }
        : {
              id: matched.id,
              ...(matched.basePlanId && { newPlanId: matched.basePlanId }),
              ...(offerToken && { offerToken }),
          };
};

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
    const { isIOS, isOnMobileApp } = getMobileAppInfo();
    const { fetchNativeProducts, purchaseAndValidate } = useSubscriptionIap();

    const platform = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;
    const { data: plansData, isLoading: isPlansLoading } = useProductPlans(
        platform ? { platform, limit: -1 } : { limit: -1 }
    );
    const allowedProductId = isIOS ? ALLOWED_PRODUCT_ID_IOS : ALLOWED_PRODUCT_ID_ANDROID;
    const plans = (plansData?.list ?? []).filter(p => p.id === allowedProductId);

    const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);
    const [matchedNativeProduct, setMatchedNativeProduct] = useState<IapProductSubscription | null>(null);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);

    const isBlocked = pageState !== PageState.Idle;
    const isKo = i18n.language.startsWith('ko');

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) postMessage({ type: 'OpenURL', data: { url } });
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
                                : plans.map(product => {
                                      const isSelected = selectedProduct?.id === product.id;
                                      const hasTrial = (product.trialDays ?? 0) > 0;
                                      const description = isKo ? product.desc : (product.descEn ?? product.desc);
                                      const displayName = isKo
                                          ? (product.name ?? product.id)
                                          : (product.nameEn ?? product.name ?? product.id);
                                      return (
                                          <button
                                              key={product.id}
                                              onClick={() => !isBlocked && setSelectedProduct(product)}
                                              disabled={isBlocked}
                                              className={cn(
                                                  'flex w-full items-center gap-[3px] rounded-[20px] border bg-white px-4 py-3 text-left shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] transition-colors dark:bg-card',
                                                  isSelected ? 'border-[#B0EA10]' : 'border-[#F4F5F5]',
                                                  isBlocked && 'opacity-60'
                                              )}
                                          >
                                              <div className="flex flex-1 flex-col gap-[4px]">
                                                  <div className="flex items-center gap-2">
                                                      <span className="text-[18px] font-semibold leading-[1.29] tracking-[-0.015em] text-[#222325] dark:text-foreground">
                                                          {displayName}
                                                      </span>
                                                      {hasTrial && (
                                                          <span className="rounded-full bg-[#B0EA10] px-2 py-0.5 text-[11px] font-semibold text-[#222325]">
                                                              {product.trialDays}d Free
                                                          </span>
                                                      )}
                                                  </div>
                                                  {description && (
                                                      <p className="text-[13px] leading-[1.4] tracking-[-0.02em] text-[#78828A]">
                                                          {description}
                                                      </p>
                                                  )}
                                                  {product.price != null && (
                                                      <span className="text-[14px] font-medium text-[#222325] dark:text-foreground">
                                                          {t('mypage.subscription.pricePerMonth', {
                                                              price: `$${product.price}`,
                                                          })}
                                                          <span className="ml-1 text-[12px] text-[#78828A]">
                                                              {t('mypage.subscription.vatIncluded')}
                                                          </span>
                                                      </span>
                                                  )}
                                              </div>
                                              <div className="flex h-[25px] w-[25px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[#CFD0D3]">
                                                  {isSelected && (
                                                      <div className="h-[13px] w-[13px] rounded-full bg-[#B0EA10]" />
                                                  )}
                                              </div>
                                          </button>
                                      );
                                  })}
                        </div>

                        {/* 하단 규정 */}
                        <div className="mt-4 rounded-[12px] bg-muted/50 px-4 py-3">
                            <p className="text-[12px] leading-[1.6] text-muted-foreground">
                                {t('mypage.subscription.autoRenewNotice')}
                            </p>
                            <div className="mt-2 flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => openPolicyUrl('/policy/terms')}
                                    className="text-[12px] font-medium text-foreground underline underline-offset-2"
                                >
                                    {t('mypage.subscription.termsOfService')}
                                </button>
                                <span className="text-[10px] text-muted-foreground/40">|</span>
                                <button
                                    type="button"
                                    onClick={() => openPolicyUrl('/policy/privacy')}
                                    className="text-[12px] font-medium text-foreground underline underline-offset-2"
                                >
                                    {t('mypage.subscription.privacyPolicy')}
                                </button>
                            </div>
                        </div>
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
            />
        </>
    );
};
