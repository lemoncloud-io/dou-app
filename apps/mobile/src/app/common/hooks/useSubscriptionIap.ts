import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    type ProductSubscription,
    type Purchase,
    type PurchaseError,
    purchaseErrorListener,
    purchaseUpdatedListener,
} from 'react-native-iap';

import { logger } from '../index';
import { subscriptionIapService } from '../services';

/**
 * @property onPurchaseSuccess: Listener for when all purchase processes are successfully completed
 * @property onPurchaseError: Listener for when an error occurs during the purchase process
 */
interface UseIapOptions {
    onPurchaseSuccess?: () => void;
    onPurchaseError?: (error: PurchaseError) => void;
}

/**
 * In-app purchase hook
 */
export const useSubscriptionIap = ({ onPurchaseSuccess, onPurchaseError }: UseIapOptions = {}) => {
    const [products, setProducts] = useState<ProductSubscription[]>([]);
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
     * - Performs server verification after a successful purchase
     * - Executes the onPurchaseSuccess callback after verification and transaction processing are complete
     */
    const handleCompleteTransaction = useCallback(
        async (purchase: Purchase) => {
            try {
                await subscriptionIapService.verifyPurchase(purchase);
                await subscriptionIapService.finish(purchase);

                await refreshPurchases();

                if (callbacks.current.onPurchaseSuccess) {
                    await callbacks.current.onPurchaseSuccess();
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
     * Process purchase
     * @param sku Product code (`Stock Keeping Unit`)
     * @param oldSku (Optional) The current subscription product code to replace for upgrade/downgrade
     */
    const handlePurchase = async (sku: string, oldSku?: string) => {
        if (loading) return;
        setLoading(true);

        try {
            await subscriptionIapService.purchase(sku, oldSku);
        } catch (e: any) {
            logger.error('IAP', 'Purchase Request Failed', e);

            /*
             * Execute restore (verification) logic if already owned
             */
            if (e.code === 'E_ALREADY_OWNED') {
                await restorePurchases();
            }
            setLoading(false);
        }
    };

    /**
     * - Scans for products that were purchased in the app but failed server verification, and retries
     * - Processes the final purchase completion transaction upon successful server verification
     * - For iOS, calling restorePurchases() will deliver all previously purchased products again via the purchaseUpdatedListener
     */
    const restorePurchases = useCallback(async () => {
        const restored = await subscriptionIapService.restorePurchases();

        if (restored.length > 0) {
            callbacks.current.onPurchaseSuccess?.();
            await refreshPurchases();
        }
    }, [refreshPurchases]);

    /**
     * Navigate to subscription management page
     */
    const openSubscriptionManagement = useCallback(async () => {
        await subscriptionIapService.linkToManageSubscriptions();
    }, []);

    return { products, currentPurchases, loading, handlePurchase, restorePurchases, openSubscriptionManagement };
};
