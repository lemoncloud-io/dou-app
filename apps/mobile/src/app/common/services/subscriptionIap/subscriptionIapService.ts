import { Linking, Platform } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    type ProductSubscription,
    type ProductSubscriptionAndroid,
    type Purchase,
    requestPurchase,
} from 'react-native-iap';
import { ANDROID_SKU_LIST, getReplacementMode, itemSkus } from './config';
import { logger } from '../log';

export const subscriptionIapService = {
    /** 인앱결제 모듈 초기화 */
    init: async (): Promise<boolean> => {
        return initConnection();
    },

    /**
     * 사용자의 과거 결제 내역(영수증)을 스토어에서 조회합니다.
     * 프론트엔드(Web)에서 영수증 검증을 직접 수행하므로,
     * 네이티브는 별도의 finish 처리 없이 날것의 영수증 데이터만 웹으로 반환합니다.
     */
    getAvailablePurchases: async (): Promise<Purchase[]> => {
        try {
            logger.info('IAP', 'Fetching available purchases for restore...');
            return await getAvailablePurchases();
        } catch (error) {
            logger.error('IAP', 'Failed to get available purchases', error);
            return [];
        }
    },

    /**
     * 구독 상품 목록 불러오기
     */
    getSubscriptions: async (): Promise<any[]> => {
        if (itemSkus.length === 0) return [];

        const products = await fetchProducts({ skus: itemSkus, type: 'subs' });
        if (!products) return [];

        if (Platform.OS === 'android') {
            return (products as ProductSubscriptionAndroid[]).flatMap(product => {
                const offers = product.subscriptionOffers ?? [];
                const uniqueBasePlans = new Map();

                offers.forEach(offer => {
                    if (!uniqueBasePlans.has(offer.basePlanIdAndroid)) {
                        const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
                        const regularPhase = phases[phases.length - 1];

                        uniqueBasePlans.set(offer.basePlanIdAndroid, {
                            ...product,
                            id: offer.basePlanIdAndroid,
                            productId: product.id,
                            offerToken: offer.offerTokenAndroid,
                            displayPrice: regularPhase?.formattedPrice ?? product.displayPrice,
                            basePlanId: offer.basePlanIdAndroid,
                            subscriptionOffers: [offer],
                        });
                    }
                });
                return Array.from(uniqueBasePlans.values());
            });
        }
        return products as ProductSubscription[];
    },

    /**
     * 구매 신청
     * @param sku 상품 코드
     * @param oldSku 업그레이드/다운그레이드 시 교체할 기존 상품 코드 (Android)
     */
    purchase: async (sku: string, oldSku?: string): Promise<void> => {
        const products = await subscriptionIapService.getSubscriptions();
        const targetProduct = products.find(p => p.id === sku);

        if (!targetProduct) throw new Error('Product not found');

        // Google 결제 파라미터 구성 (any 타입은 라이브러리 인터페이스 한계로 제한적 사용)
        const googleRequest =
            Platform.OS === 'android'
                ? {
                      skus: [targetProduct.productId],
                      subscriptionOffers: [{ sku: targetProduct.productId, offerToken: targetProduct.offerToken }],
                      subscriptionProductReplacementParams: undefined as any,
                  }
                : undefined;

        if (Platform.OS === 'android' && oldSku && googleRequest) {
            const availablePurchases = await getAvailablePurchases();
            const oldPurchase = availablePurchases.find(p => p.productId === ANDROID_SKU_LIST[0]);

            if (oldPurchase) {
                googleRequest.subscriptionProductReplacementParams = {
                    oldProductId: oldPurchase.productId,
                    replacementMode: getReplacementMode(oldSku, sku),
                };
            }
        }

        await requestPurchase({
            type: 'subs',
            request: { apple: { sku, andDangerouslyFinishTransactionAutomatically: false }, google: googleRequest },
        });
    },

    /**
     * 구독 완료 트랜잭션 처리
     * @param purchase 구매 정보
     */
    finish: async (purchase: Purchase): Promise<Purchase> => {
        await finishTransaction({ purchase, isConsumable: false });
        return purchase;
    },

    /**
     * 구독 관리 페이지 이동
     */
    linkToManageSubscriptions: async (): Promise<void> => {
        const url =
            Platform.OS === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions';
        await Linking.openURL(url);
    },
};
