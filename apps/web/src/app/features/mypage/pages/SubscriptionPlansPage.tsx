import { ChevronLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo } from '@chatic/app-messages';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    useFetchActiveSubscriptions,
    useFetchReceiptDetail,
    useValidateApple,
    useValidateGoogle,
    useProductPlans,
} from '@chatic/subscriptions';

import { useSubscriptionIap } from '../hooks';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

type PageState = 'idle' | 'purchasing';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const { isOnMobileApp, isIOS } = getMobileAppInfo();
    const { purchaseAndValidate, fetchNativeProducts } = useSubscriptionIap();

    const platform = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;
    const { data: plansData, isLoading: isPlansLoading } = useProductPlans(
        platform ? { platform, limit: -1 } : { limit: -1 }
    );
    const products = plansData?.list ?? [];
    const [selectedProduct, setSelectedProduct] = useState<ProductView | null>(null);
    const [pageState, setPageState] = useState<PageState>('idle');

    const handleSubscribe = async () => {
        if (!selectedProduct) return;
        setPageState('purchasing');
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
                setPageState('idle');
                return;
            }

            await purchaseAndValidate(
                isIOS
                    ? { id: matched?.id ?? '', newPlanId: matched?.basePlanId ?? undefined }
                    : {
                          id: matched?.id ?? '',
                          newPlanId: matched?.basePlanId ?? undefined,
                          androidOfferToken: matched?.androidOfferToken
                              ? { base: matched.androidOfferToken.base ?? undefined }
                              : undefined,
                      }
            );
            toast({ title: t('mypage.subscription.purchaseSuccess') });
            await new Promise(resolve => setTimeout(resolve, 1500));
            navigate(-1);
        } catch (e) {
            console.error('[SubscriptionPlansPage] purchase failed:', e);
            const isCancelled = (e as { code?: string })?.code === 'user-cancelled';
            if (!isCancelled) {
                toast({
                    title: t('mypage.subscription.purchaseFailed'),
                    description: e instanceof Error ? e.message : undefined,
                    variant: 'destructive',
                });
            }
        } finally {
            setPageState('idle');
        }
    };

    // DEV test panel
    const [devResult, setDevResult] = useState<string>('');
    const validateGoogle = useValidateGoogle();
    const validateApple = useValidateApple();
    const fetchActive = useFetchActiveSubscriptions();
    const fetchReceipt = useFetchReceiptDetail();
    const [receiptId, setReceiptId] = useState('');

    const runDev = async (label: string, fn: () => Promise<unknown>) => {
        setDevResult(`⏳ ${label}...`);
        try {
            const res = await fn();
            setDevResult(JSON.stringify(res, null, 2));
        } catch (e: unknown) {
            setDevResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const isBlocked = pageState === 'purchasing';

    return (
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
                        <span className="text-[15px] text-muted-foreground">{t('mypage.subscription.noProducts')}</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {products.map(product => {
                            const productKey = product.id;
                            const isSelected = selectedProduct?.id === product.id;
                            const isKo = i18n.language.startsWith('ko');
                            const description = isKo ? product.desc : (product.descEn ?? product.desc);
                            const hasTrial = (product.trialDays ?? 0) > 0;
                            return (
                                <button
                                    key={productKey}
                                    onClick={() => !isBlocked && setSelectedProduct(product)}
                                    disabled={isBlocked}
                                    className={cn(
                                        'flex w-full items-center gap-[3px] rounded-[20px] border bg-white px-4 py-3 text-left shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] transition-colors dark:bg-card',
                                        isSelected ? 'border-[#B0EA10]' : 'border-[#F4F5F5]',
                                        isBlocked && 'opacity-60'
                                    )}
                                >
                                    {/* 상품 정보 */}
                                    <div className="flex flex-1 flex-col gap-[4px]">
                                        {/* 상품명 + Free 배지 */}
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
                                        {/* description */}
                                        {description && (
                                            <p className="text-[13px] leading-[1.4] tracking-[-0.02em] text-[#78828A]">
                                                {description}
                                            </p>
                                        )}
                                        {/* 가격 + 계정 수 */}
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
                                    {/* 라디오 버튼 */}
                                    <div className="flex h-[25px] w-[25px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[#CFD0D3]">
                                        {isSelected && <div className="h-[13px] w-[13px] rounded-full bg-[#B0EA10]" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* DEV Test Panel */}
                {IS_DEV && !isOnMobileApp && (
                    <div className="mt-6 rounded-[12px] border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4">
                        <p className="mb-3 text-[13px] font-bold text-yellow-600">🛠 DEV API Tester</p>
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

                {/* Subscribe Button */}
                {products.length > 0 && (
                    <div className="mt-auto pb-safe-bottom pt-6">
                        <button
                            onClick={handleSubscribe}
                            disabled={!selectedProduct || isBlocked}
                            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[16px] font-semibold text-background disabled:opacity-40"
                        >
                            {isBlocked && <Loader2 size={18} className="animate-spin" />}
                            {isBlocked ? t('mypage.subscription.purchasing') : t('mypage.subscription.subscribe')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
