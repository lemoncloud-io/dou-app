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
     * 구독 완료 트랜잭션 처리
     * @param purchase 구매 정보
     */
    finish: async (purchase: Purchase): Promise<void> => {
        await finishTransaction({ purchase, isConsumable: false });
    },
};
