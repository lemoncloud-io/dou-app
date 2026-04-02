import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    useFetchActiveSubscriptions,
    useFetchReceiptDetail,
    useValidateApple,
    useValidateGoogle,
} from '@chatic/subscriptions';

import { useSubscriptionIap } from '../hooks';

import type { IapProductSubscription } from '@chatic/app-messages';

type PageState = 'loading' | 'idle' | 'purchasing';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';

export const SubscriptionPlansPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { isOnMobileApp, isIOS } = getMobileAppInfo();
    const { purchaseAndValidate } = useSubscriptionIap();

    const [products, setProducts] = useState<IapProductSubscription[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<IapProductSubscription | null>(null);
    const [pageState, setPageState] = useState<PageState>('loading');

    useEffect(() => {
        if (!isOnMobileApp) {
            setPageState('idle');
            return;
        }
        postMessage({ type: 'FetchProducts' });
    }, [isOnMobileApp]);

    useHandleAppMessage('OnFetchProducts', message => {
        setProducts(message.data.products);
        console.log(message.data.products);
        setPageState('idle');
    });

    const handleSubscribe = async () => {
        if (!selectedProduct) return;
        setPageState('purchasing');
        try {
            await purchaseAndValidate(selectedProduct);
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
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => !isBlocked && navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} className={cn(isBlocked && 'opacity-30')} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.subscription.plans')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-1 flex-col p-4">
                {pageState === 'loading' ? (
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-[80px] animate-pulse rounded-[16px] bg-muted" />
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <span className="text-[15px] text-muted-foreground">
                            {!isOnMobileApp ? t('mypage.subscription.mobileOnly') : t('mypage.subscription.noProducts')}
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {products.map(product => {
                            const productKey = isIOS ? product.id : (product.basePlanId ?? product.id);
                            const isSelected = selectedProduct
                                ? (isIOS ? selectedProduct.id : (selectedProduct.basePlanId ?? selectedProduct.id)) ===
                                  productKey
                                : false;
                            return (
                                <button
                                    key={productKey}
                                    onClick={() => !isBlocked && setSelectedProduct(product)}
                                    disabled={isBlocked}
                                    className={cn(
                                        'flex items-center justify-between rounded-[16px] border-2 px-5 py-4 transition-colors',
                                        isSelected
                                            ? 'border-[#B0EA10] bg-card shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)]'
                                            : 'border-border bg-card',
                                        isBlocked && 'opacity-60'
                                    )}
                                >
                                    <div className="flex flex-col items-start gap-1">
                                        <span className="text-[17px] font-semibold">
                                            {product.displayName ?? product.id}
                                        </span>
                                        <span className="text-[14px] text-muted-foreground">
                                            {product.displayPrice}
                                        </span>
                                    </div>
                                    <div className="flex h-6 w-6 items-center justify-center">
                                        {isSelected && <Check size={22} className="text-[#B0EA10]" strokeWidth={2.5} />}
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
