import { ChevronLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo, postMessage } from '@chatic/app-messages';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    useFetchActiveSubscriptions,
    useFetchReceiptDetail,
    useValidateApple,
    useValidateGoogle,
    useProductPlans,
} from '@chatic/subscriptions';

import { useSubscriptionIap } from '../hooks';
import { EmailVerifyDialog } from '../../home/components/EmailVerifyDialog';
import { useClouds } from '@chatic/users';

import type { ProductView } from '@lemoncloud/chatic-backend-api';
import type { IapProductSubscription } from '@chatic/app-messages';
import type { PurchaseProduct } from '../hooks/useSubscriptionIap';

enum PageState {
    Idle = 'idle',
    Fetching = 'fetching',
    Purchasing = 'purchasing',
}

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';
const POLICY_BASE_URL = IS_DEV ? 'https://app-dev.chatic.io' : 'https://app.chatic.io';
// TODO: 추후 서버에서 노출할 상품 목록을 관리하는 방식으로 변경 예정
const ALLOWED_PRODUCT_ID = IS_DEV ? '#pro_tier_01_dev' : '#pro_tier_01';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const { isOnMobileApp, isIOS } = getMobileAppInfo();
    const { purchaseAndValidate, fetchNativeProducts } = useSubscriptionIap();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const clouds = cloudsData?.list ?? [];

    const platform = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;
    const { data: plansData, isLoading: isPlansLoading } = useProductPlans(
        platform ? { platform, limit: -1 } : { limit: -1 }
    );
    const products = (plansData?.list ?? []).filter(p => p.id === ALLOWED_PRODUCT_ID);

    const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);
    const [matchedNativeProduct, setMatchedNativeProduct] = useState<IapProductSubscription | null>(null);
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);
    const [isEmailVerifyOpen, setIsEmailVerifyOpen] = useState(false);

    // DEV test panel
    const [devResult, setDevResult] = useState<string>('');
    const validateGoogle = useValidateGoogle();
    const validateApple = useValidateApple();
    const fetchActive = useFetchActiveSubscriptions();
    const fetchReceipt = useFetchReceiptDetail();
    const [receiptId, setReceiptId] = useState('');

    const isBlocked = pageState !== PageState.Idle;
    const submitLabel =
        pageState === PageState.Purchasing ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe');

    const openPolicyUrl = (path: string) => {
        const url = `${POLICY_BASE_URL}${path}`;
        if (isOnMobileApp) postMessage({ type: 'OpenURL', data: { url } });
        else window.open(url, '_blank');
    };

    const runDev = async (label: string, fn: () => Promise<unknown>) => {
        setDevResult(`⏳ ${label}...`);
        try {
            const res = await fn();
            setDevResult(JSON.stringify(res, null, 2));
        } catch (e: unknown) {
            setDevResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleSubscribe = async () => {
        if (!selectedProduct || isBlocked) return;
        if (clouds.length >= 1) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        setPageState(PageState.Fetching);
        try {
            const nativeProducts = await fetchNativeProducts();
            const matched = nativeProducts.find(p =>
                isIOS ? p.id === selectedProduct.id?.replace('#', '') : p.basePlanId === selectedProduct.planId
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
            toast({ title: t('mypage.subscription.purchaseSuccess') });
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

                    {/* DEV Test Panel */}
                    {IS_DEV && !isOnMobileApp && (
                        <div className="mt-6 rounded-[12px] border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4">
                            <p className="mb-3 text-[13px] font-bold text-yellow-600">DEV API Tester</p>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() =>
                                        runDev('Validate Google', () =>
                                            validateGoogle.mutateAsync({
                                                body: {
                                                    paymentType: 'google-inapp',
                                                    appId: APP_ID,
                                                    productId: 'test',
                                                    purchaseToken: 'test-token',
                                                    isSubscription: true,
                                                },
                                                params: { detail: 1 },
                                            })
                                        )
                                    }
                                    className="rounded-lg bg-yellow-600 px-3 py-2 text-[13px] font-medium text-white"
                                >
                                    #0 Validate Google (test)
                                </button>
                                <button
                                    onClick={() =>
                                        runDev('Validate Apple', () =>
                                            validateApple.mutateAsync({
                                                body: {
                                                    paymentType: 'apple-inapp',
                                                    appId: APP_ID,
                                                    productId: 'test',
                                                    purchaseToken: 'test-token',
                                                    isSubscription: true,
                                                },
                                                params: { detail: 1 },
                                            })
                                        )
                                    }
                                    className="rounded-lg bg-yellow-600 px-3 py-2 text-[13px] font-medium text-white"
                                >
                                    #0 Validate Apple (test)
                                </button>
                                <button
                                    onClick={() =>
                                        runDev('Active Subscriptions', () => fetchActive.mutateAsync({ appId: APP_ID }))
                                    }
                                    className="rounded-lg bg-yellow-600 px-3 py-2 text-[13px] font-medium text-white"
                                >
                                    #1 활성 구독 확인
                                </button>
                                <div className="flex gap-2">
                                    <input
                                        value={receiptId}
                                        onChange={e => setReceiptId(e.target.value)}
                                        placeholder="receipt-id"
                                        className="flex-1 rounded-lg border bg-background px-3 py-2 text-[13px]"
                                    />
                                    <button
                                        onClick={() =>
                                            runDev('Receipt Detail', () =>
                                                fetchReceipt.mutateAsync({
                                                    receiptId,
                                                    params: { v: true, history: true },
                                                })
                                            )
                                        }
                                        disabled={!receiptId}
                                        className="rounded-lg bg-yellow-600 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"
                                    >
                                        #2 영수증 조회
                                    </button>
                                </div>
                            </div>
                            {devResult && (
                                <pre className="mt-3 max-h-[300px] overflow-auto rounded-lg bg-black/80 p-3 text-[11px] text-green-400">
                                    {devResult}
                                </pre>
                            )}
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
