import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    ErrorCode,
    type Purchase,
    type PurchaseError,
    purchaseErrorListener,
    purchaseUpdatedListener,
} from 'react-native-iap';

import { useServices } from './index';
import type { IapProductSubscription } from '@chatic/bridge-messages';

interface UseIapOptions {
    onPurchaseSuccess?: (purchase: Purchase) => void;
    onPurchaseError?: (error: PurchaseError) => void;
}

const PURCHASE_TIMEOUT_MS = 15_000;

export const useSubscriptionIap = ({ onPurchaseSuccess, onPurchaseError }: UseIapOptions = {}) => {
    const { subscriptionIapService, logService } = useServices();
    const [products, setProducts] = useState<IapProductSubscription[]>([]);
    const [currentPurchases, setCurrentPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(false);
    const callbacks = useRef({ onPurchaseSuccess, onPurchaseError });
    const purchaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPurchaseTimeout = useCallback(() => {
        if (purchaseTimeoutRef.current) {
            clearTimeout(purchaseTimeoutRef.current);
            purchaseTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        callbacks.current = { onPurchaseSuccess, onPurchaseError };
    }, [onPurchaseSuccess, onPurchaseError]);

    useEffect(() => clearPurchaseTimeout, [clearPurchaseTimeout]);

    const refreshPurchases = useCallback(async () => {
        logService.debug('IAP', 'Refreshing purchases after transaction');
        const purchases = await subscriptionIapService.getAvailablePurchases();
        setCurrentPurchases(purchases);
    }, [subscriptionIapService, logService]);

    const handleCompleteTransaction = useCallback(
        async (purchase: Purchase) => {
            try {
                await refreshPurchases();

                if (callbacks.current.onPurchaseSuccess) {
                    callbacks.current.onPurchaseSuccess(purchase);
                }
            } catch (e) {
                logService.error('IAP', 'Failed to process transaction.', e as Error);
            } finally {
                clearPurchaseTimeout();
                setLoading(false);
            }
        },
        [refreshPurchases, logService, clearPurchaseTimeout]
    );

    useEffect(() => {
        const init = async () => {
            try {
                await subscriptionIapService.init();
                logService.info('IAP', 'Fetching available purchases for restore...');
                const [subscriptions, availablePurchase] = await Promise.all([
                    subscriptionIapService.getSubscriptions(),
                    subscriptionIapService.getAvailablePurchases(),
                ]);
                setProducts(subscriptions);
                setCurrentPurchases(availablePurchase);
            } catch (e) {
                logService.error('IAP', 'Init error.', e as Error);
            }
        };

        const updateSubscription = purchaseUpdatedListener(async purchase => {
            if (purchase.purchaseState === 'pending') {
                logService.info('IAP', `Transaction is pending. Waiting for approval. ${JSON.stringify(purchase)}`);
                clearPurchaseTimeout();
                setLoading(false);
                return;
            }

            if (Platform.OS === 'ios') {
                if (purchase.transactionId) {
                    await handleCompleteTransaction(purchase);
                } else {
                    logService.warn(
                        'IAP',
                        `Purchase updated but transactionId is missing (iOS). ${JSON.stringify(purchase)}`
                    );
                    clearPurchaseTimeout();
                    setLoading(false);
                }
            } else {
                if (purchase.purchaseToken) {
                    await handleCompleteTransaction(purchase);
                } else {
                    logService.warn(
                        'IAP',
                        `Purchase updated but purchaseToken is missing (Android). ${JSON.stringify(purchase)}`
                    );
                    clearPurchaseTimeout();
                    setLoading(false);
                }
            }
        });

        const errorSubscription = purchaseErrorListener(error => {
            clearPurchaseTimeout();
            callbacks.current.onPurchaseError?.(error);
            setLoading(false);
        });

        void init();
        return () => {
            updateSubscription.remove();
            errorSubscription.remove();
        };
    }, [handleCompleteTransaction, subscriptionIapService, logService, clearPurchaseTimeout]);

    const handlePurchase = async (id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string) => {
        if (loading) return;
        setLoading(true);

        clearPurchaseTimeout();
        purchaseTimeoutRef.current = setTimeout(() => {
            purchaseTimeoutRef.current = null;
            logService.warn('IAP', 'Purchase timed out waiting for a store response.');
            callbacks.current.onPurchaseError?.({
                code: ErrorCode.Unknown,
                message: 'Purchase timed out',
            } as PurchaseError);
            setLoading(false);
        }, PURCHASE_TIMEOUT_MS);

        try {
            await subscriptionIapService.purchase(id, offerToken, oldPlanId, newPlanId);
        } catch (e: unknown) {
            clearPurchaseTimeout();
            logService.error('IAP', 'Purchase Request Failed', e as Error);
            const error = e as Partial<PurchaseError>;
            callbacks.current.onPurchaseError?.(
                typeof error?.code === 'string'
                    ? (error as PurchaseError)
                    : { code: ErrorCode.Unknown, message: (e as Error)?.message ?? 'Purchase request failed' }
            );
            setLoading(false);
        }
    };

    const finishPurchase = useCallback(
        async (purchase: Purchase) => {
            try {
                await subscriptionIapService.finish(purchase);
                await refreshPurchases();
            } catch (e) {
                logService.error('IAP', `Failed to finish purchase: ${purchase.productId}`, e as Error);
                throw e;
            }
        },
        [refreshPurchases, subscriptionIapService, logService]
    );

    const openSubscriptionManagement = useCallback(async () => {
        await subscriptionIapService.linkToManageSubscriptions();
    }, [subscriptionIapService]);

    return { products, currentPurchases, loading, handlePurchase, finishPurchase, openSubscriptionManagement };
};
