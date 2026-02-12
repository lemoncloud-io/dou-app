import { Platform } from 'react-native';
import Config from 'react-native-config';
import {
    type ProductSubscription,
    type Purchase,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    requestPurchase,
} from 'react-native-iap';

import { Logger } from './log';

import type { PurchaseAndroid } from 'react-native-iap';

export const IOS_SKU_LIST: string[] = (Config.VITE_SUBSCRIPTION_IAP_SKUS_IOS ?? '')
    .split(',')
    .map(sku => sku.trim())
    .filter(sku => sku.length > 0);

export const ANDROID_SKU_LIST: string[] = (Config.VITE_SUBSCRIPTION_IAP_SKUS_ANDROID ?? '')
    .split(',')
    .map(sku => sku.trim())
    .filter(sku => sku.length > 0);

export const itemSkus: string[] =
    Platform.select({
        ios: IOS_SKU_LIST,
        android: ANDROID_SKU_LIST,
    }) ?? [];

/**
 * - 구독형 인앱결제 서비스
 * - 인앱결제 테스트를 위해서는 사전 iOS 및 Android 내 테스트 계정 등록 필요
 * - 인앱결제 테스트는 prod 환경 내에서만 동작
 */
export const SubscriptionIapService = {
    init: async (): Promise<boolean> => {
        return initConnection();
    },

    /**
     * - 구독 목록 불러오기
     */
    getSubscriptions: async (): Promise<ProductSubscription[]> => {
        if (itemSkus.length === 0) {
            return [];
        }

        const products = await fetchProducts({
            skus: itemSkus,
            type: 'subs',
        });
        return products as ProductSubscription[];
    },

    /**
     * - 현재 사용자의 결제 내역 조회
     */
    getAvailablePurchases: async (): Promise<Purchase[]> => {
        return getAvailablePurchases();
    },

    /**
     * 구독 요청
     * @param sku 상품 코드 (`Stock Keeping Unit`)
     * @param offerToken Android 전용 토큰
     */
    requestSubscription: async (sku: string, offerToken?: string): Promise<void> => {
        if (Platform.OS === 'android' && !offerToken) {
            throw new Error('Need offerToken in Android payment.');
        }

        await requestPurchase({
            type: 'subs',
            request: {
                apple: {
                    sku: sku,
                    andDangerouslyFinishTransactionAutomatically: false,
                },
                google: {
                    skus: [sku],
                    subscriptionOffers: [
                        {
                            offerToken: offerToken ?? '',
                            sku: sku,
                        },
                    ],
                },
            },
        });
    },

    /**
     * 구매 신청
     * @param sku 상품 코드 (`Stock Keeping Unit`)
     * @param products 상품 목록
     */
    purchase: async (sku: string, products: ProductSubscription[]): Promise<void> => {
        const targetProduct = products.find(p => p.id === sku);
        if (!targetProduct) {
            throw new Error('Product not found');
        }

        const offer = targetProduct.subscriptionOffers?.[0];
        const offerToken = offer?.offerTokenAndroid ?? undefined;

        await SubscriptionIapService.requestSubscription(sku, offerToken);
    },

    /**
     * - 앱에서 결제는 완료하였지만, 서버 검증에 실패한 상품들 탐색 후 순차적으로 재시도 처리
     * - 서버 검증 성공 시, 최종 구매 완료 트랜잭션 처리
     * @param onSuccess 최종적인 구매 트랜잭션이 완료되었을때에 대한 리스너
     */
    processUnfinishedPurchases: async (onSuccess?: () => void): Promise<void> => {
        const purchases = await getAvailablePurchases();
        if (purchases.length === 0) return;

        for (const purchase of purchases) {
            try {
                if (Platform.OS === 'android') {
                    const androidPurchase = purchase as PurchaseAndroid;
                    if (androidPurchase.isAcknowledgedAndroid) {
                        continue;
                    } else {
                        Logger.info('IAP', 'Found unfinished transaction. Retrying verification:', purchase.productId);
                    }
                }

                await SubscriptionIapService.verifyPurchase(purchase);
                await SubscriptionIapService.finish(purchase);

                if (onSuccess) {
                    onSuccess();
                }
            } catch (e) {
                Logger.error('IAP', `Failed to recover purchase: ${purchase.productId}`, e);
            }
        }
    },

    /**
     * TODO: Not Implement
     * - 영수증 검증로직
     * - 해당 함수 내에서 서버로 부터 검증을 수행 처리
     * @param purchase 구매 결과 영수증
     * @author raine@lemoncloud.io
     */
    verifyPurchase: async (purchase: Purchase): Promise<void> => {
        try {
            Logger.info('IAP', 'Server verification success', purchase);
        } catch (e) {
            Logger.error('IAP', 'Server verification failed', e);
            throw e;
        }
    },

    /**
     * 구독 완료 트랜잭션 처리
     * @param purchase 구매 정보
     */
    finish: async (purchase: Purchase): Promise<void> => {
        await finishTransaction({ purchase, isConsumable: false });
    },
};
