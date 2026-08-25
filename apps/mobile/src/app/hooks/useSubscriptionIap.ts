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
import type { IapProductSubscription } from '@chatic/app-messages';

/**
 * @property onPurchaseSuccess: Listener for when a purchase is made. Passes the raw receipt to the web for server verification.
 * @property onPurchaseError: Listener for when an error occurs during the purchase process
 */
interface UseIapOptions {
    onPurchaseSuccess?: (purchase: Purchase) => void;
    onPurchaseError?: (error: PurchaseError) => void;
}

// If the store never delivers a purchaseUpdated/Error event for a submitted request (observed as
// the "Processing payment" overlay hanging forever), nothing else in this file would ever clear
// `loading` or tell the web the attempt failed. Store round-trips that are actually going through
// resolve well under this, so it's kept short rather than mirroring the web side's own 60s timeout.
const PURCHASE_TIMEOUT_MS = 15_000;

/**
 * In-app purchase hook
 */
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

    // Purchase timers are unrelated to component lifetime — the store can still resolve after a
    // remount — but a timer left running past this hook's own life would fire `setLoading` on a
    // detached instance for no one to see, so it goes when this instance does.
    useEffect(() => clearPurchaseTimeout, [clearPurchaseTimeout]);

    /**
     * Refresh purchase history
     */
    const refreshPurchases = useCallback(async () => {
        // Routine bookkeeping after a transaction, not a user-facing event on its
        // own — the purchase itself is what's worth an `info` line.
        logService.debug('IAP', 'Refreshing purchases after transaction');
        const purchases = await subscriptionIapService.getAvailablePurchases();
        setCurrentPurchases(purchases);
    }, [subscriptionIapService, logService]);

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
                logService.error('IAP', 'Failed to process transaction.', e as Error);
            } finally {
                clearPurchaseTimeout();
                setLoading(false);
            }
        },
        [refreshPurchases, logService, clearPurchaseTimeout]
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
                // The final outcome arrives later as its own purchaseUpdated/Error event, not from
                // this request — but leaving `loading` on strands the `if (loading) return` guard in
                // handlePurchase below forever. Every purchase button tap after this one would then
                // silently no-op with no store sheet and no error, which is indistinguishable from the
                // web side's freeze even after that promise times out.
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

        // The store sheet's outcome normally arrives later via purchaseUpdatedListener /
        // purchaseErrorListener above, not from this call. If the store never delivers either
        // (a hung StoreKit/Play Billing round-trip), nothing else here would clear `loading` — the
        // "Processing payment" overlay would sit forever and the web's own purchase promise would
        // never learn the attempt failed until its own 60s timeout, if ever.
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
            // A throw here never reached the store sheet (e.g. missing offerToken, connection not
            // ready), so `purchaseErrorListener` below never fires for it. Without relaying it through
            // the same `onPurchaseError` callback, the web side never learns the attempt failed and
            // sits on its purchase promise until its own 60s timeout — this is what read as the
            // purchase button "freezing".
            const error = e as Partial<PurchaseError>;
            callbacks.current.onPurchaseError?.(
                typeof error?.code === 'string'
                    ? (error as PurchaseError)
                    : { code: ErrorCode.Unknown, message: (e as Error)?.message ?? 'Purchase request failed' }
            );
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
                logService.error('IAP', `Failed to finish purchase: ${purchase.productId}`, e as Error);
                throw e;
            }
        },
        [refreshPurchases, subscriptionIapService, logService]
    );

    /**
     * Navigate to subscription management page
     */
    const openSubscriptionManagement = useCallback(async () => {
        await subscriptionIapService.linkToManageSubscriptions();
    }, [subscriptionIapService]);

    return { products, currentPurchases, loading, handlePurchase, finishPurchase, openSubscriptionManagement };
};
