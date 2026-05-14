import { Linking, Platform } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    requestPurchase,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';

import { getReplacementMode, itemSkus } from './config';
import type { ILogService } from '../log';
import type { ISubscriptionIapService, IapProductSubscription } from './types';

export class SubscriptionIapService implements ISubscriptionIapService {
    private readonly logService: ILogService;

    constructor(logService: ILogService) {
        this.logService = logService;
    }

    public async init(): Promise<boolean> {
        return initConnection();
    }

    public async getAvailablePurchases(): Promise<Purchase[]> {
        try {
            this.logService.info('IAP', 'Fetching available purchases for restore...');
            return await getAvailablePurchases();
        } catch (error) {
            this.logService.error('IAP', 'Failed to get available purchases', error as Error);
            return [];
        }
    }

    public async getSubscriptions(): Promise<IapProductSubscription[]> {
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

                    const billingPeriod = regularPhase?.billingPeriod;
                    let periodUnit: string | undefined;
                    let periodNumber: number | undefined;

                    if (billingPeriod) {
                        const match = billingPeriod.match(/^P(\d+)([YMWD])$/);
                        if (match) {
                            periodNumber = parseInt(match[1], 10);
                            const unitChar = match[2];
                            const unitMap: Record<string, string> = {
                                Y: 'year',
                                M: 'month',
                                W: 'week',
                                D: 'day',
                            };
                            periodUnit = unitMap[unitChar as string];
                        }
                    }

                    if (!uniqueBasePlans.has(basePlanId)) {
                        uniqueBasePlans.set(basePlanId, {
                            ...product,
                            id: product.id,
                            basePlanId: basePlanId,
                            displayName: `${product.title}\n(${basePlanId})`,
                            displayPrice: regularPhase?.formattedPrice ?? product.displayPrice,
                            billingPeriod: regularPhase?.billingPeriod,
                            periodUnit: periodUnit,
                            periodNumber: periodNumber,
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
                return Array.from(uniqueBasePlans.values());
            });
        }

        return (products as any[]).map(product => {
            const num = product.subscriptionPeriodNumberIOS;
            const unit = product.subscriptionPeriodUnitIOS;
            const billingPeriod = num && unit ? `P${num}${unit.charAt(0).toUpperCase()}` : undefined;

            return {
                ...product,
                id: product.id,
                displayName: product.title,
                displayPrice: product.localizedPrice,
                currency: product.currency,
                billingPeriod,
                periodUnit: unit || undefined,
                periodNumber: num ? Number(num) : undefined,
            };
        });
    }

    public async purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void> {
        if (Platform.OS === 'android' && !offerToken) {
            throw new Error('Require offerToken for purchasing Android');
        }

        this.logService.info(
            'IAP',
            `Attempting purchase: id=${id}, offerToken=${offerToken}, oldPlanId=${oldPlanId}, newPlanId=${newPlanId}`
        );

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
            const availablePurchases = await this.getAvailablePurchases();
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
    }

    public async finish(purchase: Purchase): Promise<Purchase> {
        await finishTransaction({ purchase, isConsumable: false });
        return purchase;
    }

    public async linkToManageSubscriptions(): Promise<void> {
        const url =
            Platform.OS === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions';
        await Linking.openURL(url);
    }
}
