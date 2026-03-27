import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { type Purchase, type PurchaseError, purchaseErrorListener, purchaseUpdatedListener } from 'react-native-iap';

import { logger } from '../index';
import { subscriptionIapService } from '../services';
import type { IapProductSubscription } from '@chatic/app-messages';

/**
 * @property onPurchaseSuccess: Listener for when a purchase is made. Passes the raw receipt to the web for server verification.
 * @property onPurchaseError: Listener for when an error occurs during the purchase process
 */
interface UseIapOptions {
    onPurchaseSuccess?: (purchase: Purchase) => void;
    onPurchaseError?: (error: PurchaseError) => void;
}

/**
 * In-app purchase hook
 */
export const useSubscriptionIap = ({ onPurchaseSuccess, onPurchaseError }: UseIapOptions = {}) => {
    const [products, setProducts] = useState<IapProductSubscription[]>([]);
    const [currentPurchases, setCurrentPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(false);
    const callbacks = useRef({ onPurchaseSuccess, onPurchaseError });

    useEffect(() => {
        callbacks.current = { onPurchaseSuccess, onPurchaseError };
    }, [onPurchaseSuccess, onPurchaseError]);

    /**
     * Refresh purchase history
     */
    const refreshPurchases = useCallback(async () => {
        const purchases = await subscriptionIapService.getAvailablePurchases();
        setCurrentPurchases(purchases);
    }, []);

    /**
     * Transaction processing
     * - NO auto-verify or auto-finish here.
     * - Simply relays the raw Purchase object to the Web via onPurchaseSuccess callback.
     */
    const handleCompleteTransaction = useCallback(
        async (purchase: Purchase) => {
            try {
                await refreshPurchases();

                if (callbacks.current.onPurchaseSuccess) {
                    callbacks.current.onPurchaseSuccess(purchase);
                }
            } catch (e) {
                logger.error('IAP', 'Failed to process transaction.', e);
            } finally {
                setLoading(false);
            }
        },
        [refreshPurchases]
    );

    /**
     * - Initialization logic
     * - Registers listeners for purchase process success/failure
     * - Fetches the subscription list and the user's purchase history
     */
    useEffect(() => {
        const init = async () => {
            try {
                await subscriptionIapService.init();
                const [subscriptions, availablePurchase] = await Promise.all([
                    subscriptionIapService.getSubscriptions(),
                    subscriptionIapService.getAvailablePurchases(),
                ]);
                setProducts(subscriptions);
                setCurrentPurchases(availablePurchase);
            } catch (e) {
                logger.error('IAP', 'Init error.', e);
            }
        };

        const updateSubscription = purchaseUpdatedListener(async purchase => {
            if (purchase.purchaseState === 'pending') {
                logger.info('IAP', 'Transaction is pending. Waiting for approval.', purchase);
                return;
            }

            if (Platform.OS === 'ios') {
                if (purchase.transactionId) {
                    await handleCompleteTransaction(purchase);
                } else {
                    logger.warn('IAP', 'Purchase updated but transactionId is missing (iOS).', purchase);
                    setLoading(false);
                }
            } else {
                if (purchase.purchaseToken) {
                    await handleCompleteTransaction(purchase);
                } else {
                    logger.warn('IAP', 'Purchase updated but purchaseToken is missing (Android).', purchase);
                    setLoading(false);
                }
            }
        });

        const errorSubscription = purchaseErrorListener(error => {
            callbacks.current.onPurchaseError?.(error);
            setLoading(false);
        });

        void init();
        return () => {
            updateSubscription.remove();
            errorSubscription.remove();
        };
    }, [handleCompleteTransaction]);

    /**
     * 구매 신청
     * @param id 상품 코드 (sku)
     * @param offerToken (Android 필수) 결제할 오퍼 토큰
     * @param oldPlanId (Android) 현재 구독 중인 요금제 ID (basePlanId)
     * @param newPlanId (Android) 새로 결제하려는 요금제 ID (basePlanId) - 업/다운 판별용
     *
     * 주의사항: oldPlanId, newPlanId가 존재하지 않을 경우, Android에서는 업그레이드/다운그레이드 모드가 기본 설정값을 따름 (WITH_TIME_PRORATION)
     */
    const handlePurchase = async (id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string) => {
        if (loading) return;
        setLoading(true);

        try {
            await subscriptionIapService.purchase(id, offerToken, oldPlanId, newPlanId);
        } catch (e: any) {
            logger.error('IAP', 'Purchase Request Failed', e);

            setLoading(false);
        }
    };

    /**
     * Finish a transaction after successful server-side verification by the Web frontend
     */
    const finishPurchase = useCallback(
        async (purchase: Purchase) => {
            try {
                await subscriptionIapService.finish(purchase);
                await refreshPurchases();
            } catch (e) {
                logger.error('IAP', `Failed to finish purchase: ${purchase.productId}`, e);
                throw e;
            }
        },
        [refreshPurchases]
    );

    /**
     * Navigate to subscription management page
     */
    const openSubscriptionManagement = useCallback(async () => {
        await subscriptionIapService.linkToManageSubscriptions();
    }, []);

    return { products, currentPurchases, loading, handlePurchase, finishPurchase, openSubscriptionManagement };
};
