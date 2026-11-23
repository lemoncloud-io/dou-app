import { useCallback } from 'react';

import { useSubscriptionIap } from '../../hooks';
import { logger } from '../../services';

import { ErrorCode } from 'react-native-iap';

import type { IAppBridgeHost } from '@chatic/bridges';
import type { OnPurchaseErrorPayload, OnPurchaseSuccessPayload, WebMessageData } from '@chatic/bridge-messages';
import type { Purchase, PurchaseError } from 'react-native-iap';

export const useSubscriptionIapHandler = (bridge: IAppBridgeHost) => {
    const { products, currentPurchases, handlePurchase, finishPurchase, openSubscriptionManagement, loading } =
        useSubscriptionIap({
            onPurchaseSuccess: (purchase: Purchase) => {
                bridge.pushEvent<'OnPurchaseSuccess'>({
                    type: 'OnPurchaseSuccess',
                    success: true,
                    data: { purchase } as OnPurchaseSuccessPayload,
                });
            },

            onPurchaseError: (error: PurchaseError) => {
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
