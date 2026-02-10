import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    type ProductSubscription,
    type Purchase,
    type PurchaseAndroid,
    type PurchaseError,
    purchaseErrorListener,
    purchaseUpdatedListener,
} from 'react-native-iap';

import { Logger } from '../services';
import { SubscriptionIapService } from '../services/subscriptionIap';

/**
 * @property onPurchaseSuccess: 구매 성공 이후의 동작 리스너 (ex 서버 검증 로직)
 * @property onPurchaseError: 구매 절차 중 에러가 발생하였을 때에 대한 리스너
 * @property onPurchaseFinish: 모든 구매 프로세스가 성공적으로 마무리 되었을때에 대한 리스너
 */
interface UseIapOptions {
    onPurchaseSuccess?: (purchase: Purchase) => Promise<void>;
    onPurchaseError?: (error: PurchaseError) => void;
    onPurchaseFinish?: () => void;
}

/**
 * 인앱 결제 훅
 */
export const useSubscriptionIap = ({ onPurchaseSuccess, onPurchaseError, onPurchaseFinish }: UseIapOptions = {}) => {
    const [products, setProducts] = useState<ProductSubscription[]>([]);
    const [currentPurchases, setCurrentPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(false);

    const successCallbackRef = useRef(onPurchaseSuccess);
    const errorCallbackRef = useRef(onPurchaseError);
    const finishCallbackRef = useRef(onPurchaseFinish);

    useEffect(() => {
        successCallbackRef.current = onPurchaseSuccess;
        errorCallbackRef.current = onPurchaseError;
        finishCallbackRef.current = onPurchaseFinish;
    }, [onPurchaseSuccess, onPurchaseError, onPurchaseFinish]);

    /**
     * - 리스너 초기화
     */
    useEffect(() => {
        const init = async () => {
            try {
                await SubscriptionIapService.init();
                const subscriptions = await SubscriptionIapService.getSubscriptions();
                await getSubscriptionStatus();
                setProducts(subscriptions);
            } catch (e) {
                Logger.error('IAP', 'Load products error.', e);
            }
        };

        const purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
            const receipt = purchase.purchaseToken;

            if (receipt) {
                try {
                    if (successCallbackRef.current) {
                        Logger.info('IAP', 'Start successCallback process.', purchase);
                        await successCallbackRef.current(purchase);
                    }

                    await SubscriptionIapService.finish(purchase);
                    Logger.info('IAP', 'Approve payment', purchase);

                    if (finishCallbackRef.current) {
                        finishCallbackRef.current();
                    }
                } catch (e) {
                    // 결제는 되었지만, 서버에서 검증을 실패한 케이스
                    Logger.error('IAP', 'Failed to process after payment.', e);
                } finally {
                    setLoading(false);
                }
            }
        });

        const purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
            if (errorCallbackRef.current) {
                errorCallbackRef.current(error);
            }

            if (error.code === 'user-cancelled') {
                Logger.info('IAP', 'User cancelled.', error);
            } else {
                Logger.error('IAP', 'Failed to purchase.', error);
            }
            setLoading(false);
        });

        void init();

        return () => {
            if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
            if (purchaseErrorSubscription) purchaseErrorSubscription.remove();
        };
    });

    const getSubscriptionStatus = useCallback(async () => {
        try {
            const purchases = await SubscriptionIapService.getAvailablePurchases();
            setCurrentPurchases(purchases);
        } catch (e) {
            Logger.error('IAP', 'Failed to get subscription status', e);
        }
    }, []);

    /**
     * 구매 처리
     * @param sku 상품 코드 (`Stock Keeping Unit`)
     */
    const handlePurchase: (sku: string) => Promise<void> = async (sku: string) => {
        if (loading) return;
        setLoading(true);

        try {
            const existingPurchases = await SubscriptionIapService.getAvailablePurchases();
            const hasPendingPurchase = existingPurchases.find(p => p.id === sku);

            if (hasPendingPurchase) {
                Logger.info('IAP', 'Product already purchased. Proceeding with verification only.', sku);
                await checkUnfinishedPurchases();
                setLoading(false);
                return;
            }

            const targetProduct = products.find(p => p.id === sku) as ProductSubscription;
            const offer = targetProduct.subscriptionOffers?.[0];
            const offerToken = offer?.offerTokenAndroid ?? undefined;

            await SubscriptionIapService.requestSubscription(sku, offerToken);
        } catch (e: any) {
            Logger.error('IAP', 'Request Subscription Failed:', e);

            if (e.code === 'E_ALREADY_OWNED') {
                Logger.info('IAP', 'Product already owned. Attempting recovery.');
                await checkUnfinishedPurchases();
            }

            setLoading(false);
        }
    };

    /**
     * - 앱에서 결제는 완료하였지만, 서버 검증에 실패한 상품들 탐색 후 재시도 처리
     * - 서버 검증 성공 시, 최종 구매 완료 트랜잭션 처리
     */
    const checkUnfinishedPurchases: () => Promise<void> = useCallback(async () => {
        try {
            const purchases: Purchase[] = await SubscriptionIapService.getAvailablePurchases();

            for (const purchase of purchases) {
                if (Platform.OS === 'android') {
                    const androidPurchase = purchase as PurchaseAndroid;
                    if (androidPurchase.isAcknowledgedAndroid) {
                        continue;
                    } else {
                        Logger.info('IAP', 'Found unfinished transaction. Retrying verification:', purchase.productId);
                    }
                }

                try {
                    if (successCallbackRef.current) {
                        await successCallbackRef.current(purchase);
                    }

                    await SubscriptionIapService.finish(purchase);
                    Logger.info('IAP', 'Successfully recovered unfinished transaction:', purchase.transactionId);

                    if (finishCallbackRef.current) {
                        finishCallbackRef.current();
                    }
                } catch (retryError) {
                    Logger.error('IAP', 'Verification retry failed (Server/Validation issue persists):', retryError);
                }
            }
        } catch (e) {
            Logger.error('IAP', 'Check unfinished purchases failed.', e);
        }
    }, []);

    return { products, currentPurchases, loading, handlePurchase, checkUnfinishedPurchases };
};
