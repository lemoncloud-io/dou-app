import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { useValidateApple, useValidateGoogle, useValidateMembership, subscriptionKeys } from '@chatic/subscriptions';

import type { AppMessageData, IapProductSubscription } from '@chatic/app-messages';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';

interface NativePurchase {
    productId: string;
    transactionDate: number;
    transactionId?: string | null;
    isAutoRenewing: boolean;
    platform: string;
    purchaseToken?: string | null;
    expirationDateIOS?: number | null;
}

export interface PurchaseProduct {
    id: string;
    newPlanId?: string;
    offerToken?: string;
}

type PurchaseResult = NativePurchase;
type PurchaseError = { code: string; message?: string };

export const useSubscriptionIap = () => {
    const { isIOS } = getMobileAppInfo();
    const [isFetchingProducts, setIsFetchingProducts] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const validateGoogle = useValidateGoogle();
    const validateApple = useValidateApple();
    const validateMembership = useValidateMembership();
    const queryClient = useQueryClient();

    // Promise resolvers
    const purchaseResolverRef = useRef<{
        resolve: (value: PurchaseResult) => void;
        reject: (reason: PurchaseError) => void;
    } | null>(null);

    const finishResolverRef = useRef<{
        resolve: () => void;
    } | null>(null);

    const currentPurchasesResolverRef = useRef<{
        resolve: (purchases: NativePurchase[]) => void;
    } | null>(null);

    const nativeProductsResolverRef = useRef<{
        resolve: (products: IapProductSubscription[]) => void;
        reject: (reason: Error) => void;
    } | null>(null);

    // Listen for native messages
    useHandleAppMessage('OnPurchaseSuccess', (message: AppMessageData<'OnPurchaseSuccess'>) => {
        const result = message.data.purchase;
        purchaseResolverRef.current?.resolve(result);
        purchaseResolverRef.current = null;
    });

    useHandleAppMessage('OnPurchaseError', (message: AppMessageData<'OnPurchaseError'>) => {
        const result = message.data.error;
        purchaseResolverRef.current?.reject(result);
        purchaseResolverRef.current = null;
    });

    useHandleAppMessage('OnFinishPurchaseTransaction', () => {
        finishResolverRef.current?.resolve();
        finishResolverRef.current = null;
    });

    useHandleAppMessage('OnFetchCurrentPurchases', (message: AppMessageData<'OnFetchCurrentPurchases'>) => {
        currentPurchasesResolverRef.current?.resolve(message.data.purchases as NativePurchase[]);
        currentPurchasesResolverRef.current = null;
    });

    useHandleAppMessage('OnFetchProducts', (message: AppMessageData<'OnFetchProducts'>) => {
        nativeProductsResolverRef.current?.resolve(message.data.products);
        nativeProductsResolverRef.current = null;
    });

    /** 스토어 구매 요청 → Promise */
    const purchase = useCallback(
        (product: PurchaseProduct): Promise<PurchaseResult> => {
            return new Promise((resolve, reject) => {
                purchaseResolverRef.current = { resolve, reject };
                const id = product.id;

                const timeout = setTimeout(() => {
                    if (purchaseResolverRef.current) {
                        purchaseResolverRef.current.reject({ code: 'timeout', message: 'Purchase timed out' });
                        purchaseResolverRef.current = null;
                    }
                }, 60000);

                postMessage({
                    type: 'Purchase',
                    data: {
                        id,
                        ...(!isIOS && { offerToken: product.offerToken, newPlanId: product.newPlanId }),
                    },
                });

                const originalResolve = resolve;
                const originalReject = reject;
                purchaseResolverRef.current = {
                    resolve: result => {
                        clearTimeout(timeout);
                        originalResolve(result);
                    },
                    reject: reason => {
                        clearTimeout(timeout);
                        originalReject(reason);
                    },
                };
            });
        },
        [isIOS]
    );

    /** 서버 검증 */
    const validate = useCallback(
        async (result: PurchaseResult, email?: string) => {
            const validateFn = isIOS ? validateApple : validateGoogle;
            const response = await validateFn.mutateAsync({
                body: {
                    paymentType: isIOS ? 'apple-inapp' : 'google-inapp',
                    appId: APP_ID,
                    productId: result.productId,
                    purchaseToken: result.purchaseToken ?? '',
                    isSubscription: true,
                },
                params: { detail: 1 },
            });

            if (!response.isValid) {
                throw new Error('Validation failed: isValid=false');
            }

            await validateMembership.mutateAsync({
                body: {
                    appId: APP_ID,
                    paymentType: isIOS ? 'apple-inapp' : 'google-inapp',
                    purchaseToken: result.purchaseToken ?? '',
                    productId: result.productId,
                    ...(email && { email }),
                },
                ...(IS_DEV && { params: { dryRun: 1 } }),
            });

            return response;
        },
        [isIOS, validateApple, validateGoogle, validateMembership]
    );

    /** 트랜잭션 완료 → Promise */
    const finishTransaction = useCallback((result: PurchaseResult): Promise<void> => {
        return new Promise(resolve => {
            finishResolverRef.current = { resolve };

            postMessage({ type: 'FinishPurchaseTransaction', data: { purchase: result } } as any);
        });
    }, []);

    /** 현재 구매 목록 가져오기 → Promise */
    const fetchCurrentPurchases = useCallback((): Promise<NativePurchase[]> => {
        return new Promise(resolve => {
            currentPurchasesResolverRef.current = { resolve };
            postMessage({ type: 'FetchCurrentPurchases' });
        });
    }, []);

    /** 네이티브 상품 목록 가져오기 → Promise (Android offerToken 추출용) */
    const fetchNativeProducts = useCallback((): Promise<IapProductSubscription[]> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (nativeProductsResolverRef.current) {
                    nativeProductsResolverRef.current.reject(new Error('FetchProducts timed out'));
                    nativeProductsResolverRef.current = null;
                }
            }, 10000);
            nativeProductsResolverRef.current = {
                resolve: products => {
                    clearTimeout(timeout);
                    resolve(products);
                },
                reject: reason => {
                    clearTimeout(timeout);
                    reject(reason);
                },
            };
            postMessage({ type: 'FetchProducts' });
        });
    }, []);

    /** 구매 → 검증 → 트랜잭션 완료 (한방) */
    const purchaseAndValidate = useCallback(
        async (product: PurchaseProduct, email?: string) => {
            const result = await purchase(product);
            await validate(result, email);
            await finishTransaction(result);
            postMessage({ type: 'FetchCurrentPurchases' });
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        },
        [purchase, validate, finishTransaction]
    );

    /** 구매 복원: 현재 구매 목록 → 각각 검증 → 트랜잭션 완료 */
    const restorePurchases = useCallback(async (): Promise<number> => {
        const purchases = await fetchCurrentPurchases();
        let restored = 0;

        for (const p of purchases) {
            try {
                await validate(p);
                await finishTransaction(p);
                restored++;
            } catch (e) {
                console.warn('[useSubscriptionIap] restore skip:', p.productId, e);
            }
        }

        if (restored > 0) {
            postMessage({ type: 'FetchCurrentPurchases' });
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        }

        return restored;
    }, [fetchCurrentPurchases, validate, finishTransaction]);

    return {
        purchase,
        validate,
        finishTransaction,
        fetchCurrentPurchases,
        fetchNativeProducts,
        purchaseAndValidate,
        restorePurchases,
    };
};
