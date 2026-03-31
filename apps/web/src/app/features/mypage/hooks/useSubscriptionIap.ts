import { useCallback, useRef } from 'react';

import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { useValidateApple, useValidateGoogle } from '@chatic/subscriptions';

import type { AppMessageData } from '@chatic/app-messages';

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

type PurchaseResult = NativePurchase;
type PurchaseError = { code: string; message?: string };

export const useSubscriptionIap = () => {
    const { isIOS } = getMobileAppInfo();
    const validateGoogle = useValidateGoogle();
    const validateApple = useValidateApple();

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

    // Listen for native messages
    useHandleAppMessage('OnPurchase', (message: AppMessageData<'OnPurchase'>) => {
        const result = message.data.purchase;
        if ('code' in result) {
            purchaseResolverRef.current?.reject(result as PurchaseError);
        } else {
            purchaseResolverRef.current?.resolve(result as unknown as PurchaseResult);
        }
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

    /** 스토어 구매 요청 → Promise */
    const purchase = useCallback((productId: string, offerToken?: string): Promise<PurchaseResult> => {
        return new Promise((resolve, reject) => {
            purchaseResolverRef.current = { resolve, reject };
            postMessage({ type: 'Purchase', data: { id: productId, offerToken } });
        });
    }, []);

    /** 서버 검증 */
    const validate = useCallback(
        async (result: PurchaseResult) => {
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

            return response;
        },
        [isIOS, validateApple, validateGoogle]
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

    /** 구매 → 검증 → 트랜잭션 완료 (한방) */
    const purchaseAndValidate = useCallback(
        async (productId: string, offerToken?: string) => {
            const result = await purchase(productId, offerToken);
            await validate(result);
            await finishTransaction(result);
            postMessage({ type: 'FetchCurrentPurchases' });
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
        }

        return restored;
    }, [fetchCurrentPurchases, validate, finishTransaction]);

    return {
        purchase,
        validate,
        finishTransaction,
        fetchCurrentPurchases,
        purchaseAndValidate,
        restorePurchases,
    };
};
