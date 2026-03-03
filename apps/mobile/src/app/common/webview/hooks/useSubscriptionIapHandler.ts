import { useCallback, useEffect } from 'react';

import { useSubscriptionIap } from '../../hooks';
import { Logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData } from '@chatic/app-messages';
import type { PurchaseError } from 'react-native-iap';

/**
 * 웹뷰에서 인앱결제 기능을 사용하기 위한 핸들러 훅
 * @param bridge
 */
export const useSubscriptionIapHandler = (bridge: WebViewBridge) => {
    const { products, currentPurchases, handlePurchase, restorePurchases, loading } = useSubscriptionIap({
        /**
         * 모든 결제 및 서버 검증 프로세스가 성공적으로 마무리 되었을 때 수행되는 콜백
         */
        onPurchaseSuccess: () => {
            const message: AppMessageData<'OnSuccessPurchase'> = {
                type: 'OnSuccessPurchase',
            };
            bridge.post(message);
        },
        /**
         * 결제 프로세스 중 에러가 발생했을때에 대한 콜백
         * @param error
         */
        onPurchaseError: (error: PurchaseError) => {
            Logger.error('IAP', 'Purchase failed:', error);
        },
    });

    useEffect(() => {
        const message: AppMessageData<'OnUpdatePurchases'> = {
            type: 'OnUpdatePurchases',
            data: { purchases: currentPurchases },
        };
        bridge.post(message);
    }, [bridge, currentPurchases]);

    /**
     * 구독 상품 목록 조회
     */
    const getProducts = useCallback(async () => {
        const message: AppMessageData<'OnUpdateProductSubscriptions'> = {
            type: 'OnUpdateProductSubscriptions',
            data: { products },
        };
        bridge.post(message);
    }, [bridge, products]);

    /**
     * 현재 보유 중인 구독권 조회
     */
    const getCurrentPurchases = useCallback(async () => {
        const message: AppMessageData<'OnUpdatePurchases'> = {
            type: 'OnUpdatePurchases',
            data: { purchases: currentPurchases },
        };
        bridge.post(message);
    }, [bridge, currentPurchases]);

    /**
     * 구매 복구
     */
    const restorePurchase = useCallback(async () => {
        await restorePurchases();
        const message: AppMessageData<'OnSuccessPurchase'> = {
            type: 'OnSuccessPurchase',
        };
        bridge.post(message);
    }, [bridge, restorePurchases]);

    /**
     * 구독권 구매 수행
     */
    const purchaseSubscription: (sku: string) => Promise<void> = useCallback(
        async (sku: string) => {
            await handlePurchase(sku);
        },
        [handlePurchase]
    );

    return {
        getProducts,
        getCurrentPurchases,
        restorePurchase,
        purchaseSubscription,
        isIapLoading: loading,
    };
};
