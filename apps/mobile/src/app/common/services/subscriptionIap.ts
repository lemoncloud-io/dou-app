import { Linking, Platform } from 'react-native';
import Config from 'react-native-config';
import type { SubscriptionReplacementModeAndroid, SubscriptionProductReplacementParamsAndroid } from 'react-native-iap';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    type ProductSubscription,
    type Purchase,
    requestPurchase,
} from 'react-native-iap';

import { logger } from './log';

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
 * `.env` 파일에 기록된 배열 순서를 바탕으로 Android 상품의 등급(Tier)을 계산합니다.
 *
 *  `[CRITICAL WARNING]`
 *
 * 이 함수는 배열의 인덱스(Index)를 등급 점수로 사용합니다.
 * 따라서 `.env` 파일의 `VITE_SUBSCRIPTION_IAP_SKUS_ANDROID` 값은
 * 반드시 가장 낮은 등급의 요금제부터 높은 등급 순서(오름차순)로 기입되어야 합니다.
 *
 * 만약 순서를 오기입하거나 뒤섞어서 기입할 경우:
 * 1. Android 업그레이드/다운그레이드 판별 로직이 완전히 반대로 동작합니다.
 * 2. 업그레이드 시 잔여 금액이 환산되지 않거나, 다운그레이드 시 사용자의 혜택이 즉시 박탈되는 등 심각한 결제 클레임의 원인이 됩니다.
 * @param sku - 등급을 조회할 안드로이드 상품 SKU 코드
 * @returns 1부터 시작하는 등급 점수 (목록에 존재하지 않을 경우 0 반환)
 */
const getSkuRank = (sku: string): number => {
    if (Platform.OS !== 'android') return 0;
    const index = ANDROID_SKU_LIST.indexOf(sku);
    return index !== -1 ? index + 1 : 0;
};
/**
 * - 업그레이드 및 다운그레이드 처리 함수
 * - 업그레이드: 즉시 변경하고 남은 시간만큼 돈으로 환산
 * - 다운그레이드: 이번 결제 주기까지는 상위 혜택 유지, 다음 주기부터 변경
 * @param oldSku 기존 상품
 * @param newSku 새로운 상품
 */
const getReplacementMode = (oldSku: string, newSku: string): SubscriptionReplacementModeAndroid => {
    const oldRank = getSkuRank(oldSku);
    const newRank = getSkuRank(newSku);

    if (newRank > oldRank) {
        return 'with-time-proration';
    } else if (newRank < oldRank) {
        return 'deferred';
    } else {
        return 'with-time-proration';
    }
};

/**
 * - 구독형 인앱결제 서비스
 * - 인앱결제 테스트를 위해서는 사전 iOS 및 Android 내 테스트 계정 등록 필요
 * - 인앱결제 테스트는 Release 환경 내에서만 동작
 */
export const subscriptionIapService = {
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
     * 구매 신청
     * @param sku 상품 코드 (`Stock Keeping Unit`)
     * @param oldSku (Android Only) 업그레이드/다운그레이드 시 교체할 기존 상품 코드
     * @returns void; 실제 구매 완료 데이터는 리스너를 통해 수신
     */
    purchase: async (sku: string, oldSku?: string): Promise<void> => {
        const products = await subscriptionIapService.getSubscriptions();
        const targetProduct = products.find(p => p.id === sku);
        if (!targetProduct) {
            throw new Error('Product not found');
        }

        const offer = targetProduct.subscriptionOffers?.[0];
        const offerToken = offer?.offerTokenAndroid ?? undefined;

        if (Platform.OS === 'android' && !offerToken) {
            throw new Error('Need offerToken in Android payment.');
        }

        let subscriptionProductReplacementParamsAndroid: SubscriptionProductReplacementParamsAndroid | undefined =
            undefined;

        if (Platform.OS === 'android' && oldSku) {
            const availablePurchases = await getAvailablePurchases();
            const oldPurchase = availablePurchases.find(p => p.productId === oldSku);

            if (oldPurchase?.productId) {
                subscriptionProductReplacementParamsAndroid = {
                    oldProductId: oldPurchase.productId,
                    replacementMode: getReplacementMode(oldSku, sku),
                };
            }
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
                    subscriptionProductReplacementParams: subscriptionProductReplacementParamsAndroid,
                },
            },
        });
    },

    /**
     * 구매 복원
     * - 스토어(Apple/Google)의 유효한 구매 내역(영수증)을 조회
     * - 조회된 내역을 백엔드 서버로 보내 유효성을 검증하고, 사용자 DB와 동기화
     * - 동기화가 완료된 구매 내역 목록을 반환
     * -
     */
    restorePurchases: async (): Promise<Purchase[]> => {
        const purchases = await getAvailablePurchases();
        const restoredPurchases: Purchase[] = [];

        for (const purchase of purchases) {
            try {
                logger.info('IAP', 'Syncing transaction:', purchase.productId);

                await subscriptionIapService.verifyPurchase(purchase);
                await subscriptionIapService.finish(purchase);

                restoredPurchases.push(purchase);
            } catch (e) {
                logger.error('IAP', `Failed to restore purchase: ${purchase.productId}`, e);
            }
        }
        return restoredPurchases;
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
            // TODO: [Server Integration]
            // 백엔드 API를 호출하여 purchase.transactionReceipt(iOS) 또는 purchase.purchaseToken(Android)을 검증필요
            logger.info('IAP', 'Server verification success', purchase);
        } catch (e) {
            logger.error('IAP', 'Server verification failed', e);
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

    /**
     * - 구독 관리(취소) 페이지로 이동
     * - 앱 내에서 직접 취소는 불가능하며, 스토어의 관리 페이지로 이동시켜야 함
     */
    linkToManageSubscriptions: async (): Promise<void> => {
        if (Platform.OS === 'ios') {
            await Linking.openURL('https://apps.apple.com/account/subscriptions');
        } else {
            await Linking.openURL('https://play.google.com/store/account/subscriptions');
        }
    },
};
