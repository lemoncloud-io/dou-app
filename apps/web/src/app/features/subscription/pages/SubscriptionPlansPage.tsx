import { ChevronLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { appBridge } from '../../../bridge';
import { ROUTES } from '../../../routes/paths';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useClouds } from '@chatic/web-core';

import { useAllowedProduct, useSubscriptionIap } from '../hooks';
import { EmailVerifyDialog } from '../../home/components/EmailVerifyDialog';

import type { ProductView } from '@lemoncloud/chatic-backend-api';
import type { IapProductSubscription } from '@chatic/app-messages';
import { PageState, type PurchaseProduct } from '../types';
import { POLICY_BASE_URL } from '../consts';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    // Platform sniffing + allowed-product resolution is shared with the cloud guide (useAllowedProduct)
    // so the two screens can never disagree about which store's product applies.
    const { isOnMobileApp, isIOS, product, isLoading: isPlansLoading } = useAllowedProduct();
    const { purchaseAndValidate, fetchNativeProducts } = useSubscriptionIap();
    const { isGuest } = useRuntimeProfile();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const clouds = cloudsData?.list ?? [];

    // This page only ever renders inside the native shell (it is IAP-only), so the native-gated
    // `product` from the hook is the same set the old unfiltered filter produced.
    const products = product ? [product] : [];

    const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);
    const [matchedNativeProduct, setMatchedNativeProduct] = useState<IapProductSubscription | null>(null);
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);

    const isBlocked = pageState !== PageState.Idle;
    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) appBridge.openURL(url);
        else window.open(url, '_blank');
    };

    const handleSubscribe = async () => {
        if (!selectedProduct || isBlocked) return;
        // A guest session has no account for the receipt to attach to, so send them to login before the
        // email step rather than after. `purchaseAndValidate` also refuses, but only once the email
        // dialog has already opened — which reads as "collect my email, then fail".
        if (isGuest) {
            navigate(ROUTES.mypage.login);
            return;
        }
        if (clouds.length >= 1) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        setPageState(PageState.Fetching);
        try {
            const nativeProducts = await fetchNativeProducts();
            const matched = nativeProducts.find(p =>
                // 서버에서 가져오는 id 필드에는 basePlanId 정보가 포함되어있음
                isIOS
                    ? p.id === selectedProduct.id?.replace('#', '')
                    : p.basePlanId === selectedProduct.id?.replace('#', '')
            );
            if (!matched) {
                toast({
                    title: t('mypage.subscription.purchaseFailed'),
                    description: 'Product not found on store',
                    variant: 'destructive',
                });
                return;
            }
            setMatchedNativeProduct(matched);
            setIsEmailVerifyOpen(true);
        } finally {
            setPageState(PageState.Idle);
        }
    };

    const handleVerified = async (email: string) => {
        if (!matchedNativeProduct) return;
        const offerToken =
            matchedNativeProduct.androidOfferToken?.freeTrial ?? matchedNativeProduct.androidOfferToken?.base;
        if (!isIOS && !offerToken) {
            toast({
                title: t('mypage.subscription.purchaseFailed'),
                description: 'offerToken is required for Android',
                variant: 'destructive',
            });
            return;
        }
        setPageState(PageState.Purchasing);
        const product: PurchaseProduct = {
            id: matchedNativeProduct.id,
            ...(matchedNativeProduct.basePlanId && { newPlanId: matchedNativeProduct.basePlanId }),
            ...(!isIOS && offerToken && { offerToken }),
        };
        try {
            await purchaseAndValidate(product, email);
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
        } finally {
            setPageState(PageState.Idle);
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
                    ) : products.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center">
                            <span className="text-[15px] text-muted-foreground">
                                {t('mypage.subscription.noProducts')}
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {products.map(product => {
                                const isSelected = selectedProduct?.id === product.id;
                                const isKo = i18n.language.startsWith('ko');
                                const description = isKo ? product.desc : (product.descEn ?? product.desc);
                                const hasTrial = (product.trialDays ?? 0) > 0;

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
                                                    {isKo
                                                        ? (product.name ?? product.id)
                                                        : (product.nameEn ?? product.name ?? product.id)}
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
                                            <div className="flex flex-col gap-[1px]">
                                                {product.price != null && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[16px] font-medium leading-[1.5] tracking-[-0.02em] text-[#222325] dark:text-foreground">
                                                            {t('mypage.subscription.pricePerMonth', {
                                                                price: `$${product.price}`,
                                                            })}
                                                        </span>
                                                        <span className="text-[14px] leading-[1.5] tracking-[-0.02em] text-[#78828A]">
                                                            {t('mypage.subscription.vatIncluded')}
                                                        </span>
                                                    </div>
                                                )}
                                                {product.maxClouds != null && (
                                                    <span className="text-[14px] leading-[1.5] tracking-[-0.02em] text-[#78828A]">
                                                        {isKo
                                                            ? `계정 ${product.maxClouds}개 구독 가능`
                                                            : `Up to ${product.maxClouds} accounts`}
                                                    </span>
                                                )}
                                            </div>
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
                    )}

                    {/* Auto-renewal notice + Policy Links + Subscribe Button */}
                    {products.length > 0 && (
                        <div className="mt-auto pb-safe-bottom pt-6">
                            <div className="mb-4 rounded-[12px] bg-muted/50 px-4 py-3">
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
                            <button
                                onClick={handleSubscribe}
                                disabled={!selectedProduct || isBlocked}
                                className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[16px] font-semibold text-background disabled:opacity-40"
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
                onVerified={handleVerified}
            />
        </>
    );
};
