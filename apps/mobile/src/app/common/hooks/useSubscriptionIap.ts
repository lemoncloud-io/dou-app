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
 * @property onPurchaseSuccess: 모든 구매 프로세스가 성공적으로 마무리 되었을때에 대한 리스너
 * @property onPurchaseError: 구매 절차 중 에러가 발생하였을 때에 대한 리스너
 */
interface UseIapOptions {
    onPurchaseSuccess?: () => void;
    onPurchaseError?: (error: PurchaseError) => void;
}

/**
 * 인앱 결제 훅
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
     * 구매내역 최신화
     */
    const refreshPurchases = useCallback(async () => {
        const purchases = await subscriptionIapService.getAvailablePurchases();
        setCurrentPurchases(purchases);
    }, []);

    /**
     * 트랜잭션 처리 프로세스
     * - 구매 성공 이후 서버 검증 수행
     * - 검증 및 트랜잭션 처리 완료 이후 onPurchaseSuccess 콜백 수행
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
     * - 초기화 로직
     * - 구매 프로세스 성공/실패 리스너 등록
     * - 구독 목록 및 사용자의 결제내역 조회
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
     * 구매 처리
     * @param sku 상품 코드 (`Stock Keeping Unit`)
     * @param oldSku (Optional) 업그레이드/다운그레이드 시 교체할 현재 구독중인 상품 코드
     */
    const handlePurchase = async (sku: string, oldSku?: string) => {
        if (loading) return;
        setLoading(true);

        try {
            await subscriptionIapService.purchase(sku, oldSku);
        } catch (e: any) {
            logger.error('IAP', 'Purchase Request Failed', e);

            /*
             *  이미 보유 중인 경우 복구(검증) 로직 실행
             */
            if (e.code === 'E_ALREADY_OWNED') {
                await restorePurchases();
            }
            setLoading(false);
        }
    };

    /**
     * - 앱에서 결제는 완료하였지만, 서버 검증에 실패한 상품들 탐색 후 재시도 처리
     * - 서버 검증 성공 시, 최종 구매 완료 트랜잭션 처리
     * - iOS의 경우 restorePurchases()를 호출하면 이전에 구매했던 모든 상품들이 purchaseUpdatedListener를 통해 다시 전달
     */
    const restorePurchases = useCallback(async () => {
        const restored = await subscriptionIapService.restorePurchases();

        if (restored.length > 0) {
            callbacks.current.onPurchaseSuccess?.();
            await refreshPurchases();
        }
    }, [refreshPurchases]);

    /**
     * 구독 관리 페이지 이동
     */
    const openSubscriptionManagement = useCallback(async () => {
        await subscriptionIapService.linkToManageSubscriptions();
    }, []);

    return { products, currentPurchases, loading, handlePurchase, restorePurchases, openSubscriptionManagement };
};
