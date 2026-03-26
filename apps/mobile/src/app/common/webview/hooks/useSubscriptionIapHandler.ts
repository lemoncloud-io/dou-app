import { useCallback } from 'react';

import { useSubscriptionIap } from '../../hooks';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData } from '@chatic/app-messages';
import type { Purchase, PurchaseError } from 'react-native-iap';

/**
 * 웹뷰에서 인앱결제 기능을 사용하기 위한 핸들러 훅
 * @param bridge
 */
export const useSubscriptionIapHandler = (bridge: WebViewBridge) => {
    const { products, currentPurchases, handlePurchase, finishPurchase, openSubscriptionManagement, loading } =
        useSubscriptionIap({
            /**
             * 결제가 성공하면, 네이티브는 검증/완료 처리 없이 영수증을 그대로 웹으로 전달합니다.
             * 웹 프론트엔드가 이 영수증을 받아 백엔드 서버 검증을 책임집니다.
             */
            onPurchaseSuccess: (purchase: Purchase) => {
                const message: AppMessageData<'OnPurchase'> = {
                    type: 'OnPurchase',
                    data: {
                        purchase: purchase,
                    },
                };
                bridge.post(message);
            },

            /**
             * 결제 프로세스 중 에러가 발생했을때에 대한 콜백
             * @param error
             */
            onPurchaseError: (error: PurchaseError) => {
                logger.error('IAP', 'Purchase failed:', error);
                const message: AppMessageData<'OnPurchase'> = {
                    type: 'OnPurchase',
                    data: {
                        purchase: error,
                    },
                };
                bridge.post(message);
            },
        });

    /**
     * 구독 상품 목록 조회
     */
    const fetchProducts = useCallback(async () => {
        const message: AppMessageData<'OnFetchProducts'> = {
            type: 'OnFetchProducts',
            data: { products },
        };
        bridge.post(message);
    }, [bridge, products]);

    /**
     * 현재 보유 중인 구독권 조회
     */
    const fetchCurrentPurchases = useCallback(async () => {
        const message: AppMessageData<'OnFetchCurrentPurchases'> = {
            type: 'OnFetchCurrentPurchases',
            data: { purchases: currentPurchases },
        };
        bridge.post(message);
    }, [bridge, currentPurchases]);

    /**
     * 구독권 구매 수행
     */
    const handlePurchaseSubscription = useCallback(
        async (sku: string, oldSku?: string) => {
            await handlePurchase(sku, oldSku);
        },
        [handlePurchase]
    );

    /**
     * 웹에서 서버 검증을 마친 후, 해당 트랜잭션을 스토어에서 완료(소비) 처리하도록 요청받는 핸들러
     */
    const handleFinishPurchase = useCallback(
        async (purchase: Purchase) => {
            await finishPurchase(purchase);
            const message: AppMessageData<'OnFinishPurchaseTransaction'> = {
                type: 'OnFinishPurchaseTransaction',
                data: { purchase },
            };
            bridge.post(message);
        },
        [bridge, finishPurchase]
    );

    /**
     * 구독 관리 페이지 이동 핸들러
     */
    const handleOpenSubscriptionManagement = useCallback(async () => {
        await openSubscriptionManagement();
    }, [openSubscriptionManagement]);

    return {
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
        isIapLoading: loading,
    };
};
