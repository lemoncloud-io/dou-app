import { Linking, Platform } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    type Purchase,
    requestPurchase,
} from 'react-native-iap';
import { getReplacementMode, itemSkus } from './config';
import { logger } from '../log';
import type { IapProductSubscription } from '@chatic/app-messages';

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
    getSubscriptions: async (): Promise<IapProductSubscription[]> => {
        if (itemSkus.length === 0) return [];

        const products = await fetchProducts({ skus: itemSkus, type: 'subs' });
        if (!products) return [];

        if (Platform.OS === 'android') {
            return (products as IapProductSubscription[]).flatMap(product => {
                const offers = product.subscriptionOffers ?? [];
                const uniqueBasePlans = new Map();

                //모든 플랜의 루프를 돌면서 플랜에 대한 요금제 채우기
                offers.forEach(offer => {
                    const basePlanId = offer.basePlanIdAndroid;
                    const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
                    const regularPhase = phases[phases.length - 1];
                    const isFreeTrial = phases.some(phase => String(phase.priceAmountMicros) === '0');

                    if (!uniqueBasePlans.has(basePlanId)) {
                        uniqueBasePlans.set(basePlanId, {
                            ...product,
                            id: product.id,
                            basePlanId: basePlanId,
                            displayPrice: regularPhase?.formattedPrice ?? product.displayPrice,
                            androidOfferToken: {
                                freeTrial: null,
                                base: null,
                            },
                            subscriptionOffers: [],
                        });
                    }

                    const planData = uniqueBasePlans.get(offer.basePlanIdAndroid);
                    planData.subscriptionOffers.push(offer);

                    if (isFreeTrial) {
                        planData.androidOfferToken.freeTrial = offer.offerTokenAndroid;
                    } else if (!planData.androidOfferToken.base) {
                        planData.androidOfferToken.base = offer.offerTokenAndroid;
                    }
                });

                console.log(Array.from(uniqueBasePlans.values()));
                return Array.from(uniqueBasePlans.values());
            });
        }

        return products as IapProductSubscription[];
    },

    /**
     * 구매 신청
     * @param id 상품 코드 (sku)
     * @param offerToken (Android 필수) 결제할 오퍼 토큰
     * @param oldPlanId (Android) 현재 구독 중인 요금제 ID (basePlanId)
     * @param newPlanId (Android) 새로 결제하려는 요금제 ID (basePlanId) - 업/다운 판별용
     *
     * 주의사항: oldPlanId, newPlanId가 존재하지 않을 경우, Android에서는 업그레이드/다운그레이드 모드가 기본 설정값을 따름 (WITH_TIME_PRORATION)
     */
    purchase: async (id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void> => {
        if (Platform.OS === 'android' && !offerToken) {
            throw new Error('Require offerToken for purchasing Android');
        }

        console.log(id, offerToken, oldPlanId, newPlanId);

        const googleRequest: any =
            Platform.OS === 'android'
                ? {
                      skus: [id],
                      subscriptionOffers: [{ sku: id, offerToken: offerToken }],
                      subscriptionProductReplacementParams: undefined as any,
                  }
                : undefined;

        // Android 환경이면서, 업그레이드/다운그레이드에 필요한 데이터가 전부 존재할때
        if (Platform.OS === 'android' && oldPlanId && newPlanId && googleRequest) {
            // sku를 활용하여 이전 구매내역 찾기
            const availablePurchases = await getAvailablePurchases();
            const oldPurchase = availablePurchases.find(p => p.productId === id);

            // 이전 구매내역이 존재할 경우 업그레이드/다운그레이드 관련 파라미터 추가
            if (oldPurchase) {
                googleRequest.subscriptionProductReplacementParams = {
                    oldPurchaseToken: oldPurchase.purchaseToken,
                    replacementMode: getReplacementMode(oldPlanId, newPlanId),
                };
            }
        }

        await requestPurchase({
            type: 'subs',
            request: {
                apple: { sku: id, andDangerouslyFinishTransactionAutomatically: false },
                google: googleRequest,
            },
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
