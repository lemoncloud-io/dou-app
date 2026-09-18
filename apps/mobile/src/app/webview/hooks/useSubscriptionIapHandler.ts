import { useCallback } from 'react';

import { useSubscriptionIap } from '../../hooks';
import { logger } from '../../services';

import { ErrorCode } from 'react-native-iap';

import type { IAppBridgeHost } from '@chatic/bridges';
import type { OnPurchaseErrorPayload, OnPurchaseSuccessPayload, WebMessageData } from '@chatic/app-messages';
import type { Purchase, PurchaseError } from 'react-native-iap';

/**
 * Handler hook for using in-app purchase functionality from the WebView.
 * @param bridge
 */
export const useSubscriptionIapHandler = (bridge: IAppBridgeHost) => {
    const { products, currentPurchases, handlePurchase, finishPurchase, openSubscriptionManagement, loading } =
        useSubscriptionIap({
            /**
             * When a purchase succeeds, native passes the receipt straight to the web without
             * validating or finishing it. The web frontend takes the receipt and is responsible
             * for backend server-side validation.
             */
            onPurchaseSuccess: (purchase: Purchase) => {
                bridge.pushEvent<'OnPurchaseSuccess'>({
                    type: 'OnPurchaseSuccess',
                    success: true,
                    data: { purchase } as OnPurchaseSuccessPayload,
                });
            },

            /**
             * Callback for when an error occurs during the purchase process.
             * @param error
             */
            onPurchaseError: (error: PurchaseError) => {
                // Already-owned means the store still holds an entitlement for this account (e.g. a
                // crash between charge and validation) — the web side recovers via restorePurchases,
                // so this isn't an unexpected failure and shouldn't read as one in error logs/reporting.
                if (error.code === ErrorCode.AlreadyOwned) {
                    logger.warn('IAP', 'Purchase failed: already owned', error);
                } else {
                    logger.error('IAP', 'Purchase failed:', error);
                }
                bridge.pushEvent<'OnPurchaseError'>({
                    type: 'OnPurchaseError',
                    success: false,
                    data: { error } as OnPurchaseErrorPayload,
                });
            },
        });

    /**
     * Fetches the list of subscription products.
     */
    const fetchProducts = useCallback(
        async (_message: WebMessageData<'FetchProducts'>) => {
            return {
                type: 'OnFetchProducts' as const,
                success: true,
                data: { products },
            };
        },
        [products]
    );

    /**
     * Fetches the subscriptions currently held.
     */
    const fetchCurrentPurchases = useCallback(
        async (_message: WebMessageData<'FetchCurrentPurchases'>) => {
            return {
                type: 'OnFetchCurrentPurchases' as const,
                success: true,
                data: { purchases: currentPurchases },
            };
        },
        [currentPurchases]
    );

    /**
     * Performs a subscription purchase.
     */
    const handlePurchaseSubscription = useCallback(
        async (message: WebMessageData<'Purchase'>) => {
            const { id, offerToken, oldPlanId, newPlanId } = message.data;
            try {
                await handlePurchase(id, offerToken, oldPlanId, newPlanId);
                return { type: 'void' as const, success: true };
            } catch (e: any) {
                logger.error('IAP', 'handlePurchase error', e);
                return {
                    type: 'void' as const,
                    success: false,
                    error: { code: 'PURCHASE_INIT_ERROR', message: e.message },
                };
            }
        },
        [handlePurchase]
    );

    /**
     * Handler invoked, after the web has finished server-side validation, to request that the
     * store finish (consume) the given transaction.
     */
    const handleFinishPurchase = useCallback(
        async (message: WebMessageData<'FinishPurchaseTransaction'>) => {
            const { purchase } = message.data;
            try {
                await finishPurchase(purchase);
                return {
                    type: 'OnFinishPurchaseTransaction' as const,
                    success: true,
                    data: { purchase },
                };
            } catch (e: any) {
                logger.error('IAP', 'finishPurchase error', e);
                return {
                    type: 'OnFinishPurchaseTransaction' as const,
                    success: false,
                    error: { code: 'FINISH_PURCHASE_ERROR', message: e.message },
                };
            }
        },
        [finishPurchase]
    );

    /**
     * Handler that navigates to the subscription management page.
     */
    const handleOpenSubscriptionManagement = useCallback(
        async (_message: WebMessageData<'OpenSubscriptionManagement'>) => {
            try {
                await openSubscriptionManagement();
                return { type: 'void' as const, success: true };
            } catch (e: any) {
                logger.error('IAP', 'openSubscriptionManagement error', e);
                return {
                    type: 'void' as const,
                    success: false,
                    error: { code: 'OPEN_MANAGE_ERROR', message: e.message },
                };
            }
        },
        [openSubscriptionManagement]
    );

    return {
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        isIapLoading: loading,
    };
};
