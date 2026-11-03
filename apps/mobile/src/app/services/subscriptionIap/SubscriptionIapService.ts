import { Linking, Platform } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    requestPurchase,
} from 'react-native-iap';
import type { ProductSubscriptionIOS, Purchase } from 'react-native-iap';

import { getReplacementMode, itemSkus } from './config';
import type { ILogService } from '../log';
import type { ISubscriptionIapService, IapProductSubscription } from './types';

export class SubscriptionIapService implements ISubscriptionIapService {
    private readonly logService: ILogService;

    constructor(logService: ILogService) {
        this.logService = logService;
    }

    public async init(): Promise<boolean> {
        try {
            return await initConnection();
        } catch (error) {
            // A failed store connection kills every later purchase, and it used to be a bare
            // rethrow: the user saw "payment failed" while the reason — the connection never
            // opened — existed nowhere (ADR-0099).
            this.logService.error('IAP', 'Store connection failed', error as Error);
            throw error;
        }
    }

    /**
     * Callers log their own reason for fetching (restore on launch, post-purchase
     * refresh, replacement lookup) — logging it here too would print the same
     * generic line for three unrelated events.
     */
    public async getAvailablePurchases(): Promise<Purchase[]> {
        try {
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

                // Loop over all offers, filling in pricing per plan
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

        // Typed rather than `any`: the old `any` let this read `localizedPrice`, a field iOS products
        // no longer carry, and the `undefined` it returned overwrote the store's own `displayPrice`.
        // The web shows only the store's price, so every iOS plan read as "store unavailable".
        return (products as ProductSubscriptionIOS[]).map(product => {
            const num = product.subscriptionPeriodNumberIOS;
            // StoreKit reports `empty` for a product with no period; passing it on would read as a
            // 'P1E' billing period.
            const rawUnit = product.subscriptionPeriodUnitIOS;
            const unit = rawUnit && rawUnit !== 'empty' ? rawUnit : undefined;
            const billingPeriod = num && unit ? `P${num}${unit.charAt(0).toUpperCase()}` : undefined;

            return {
                ...product,
                id: product.id,
                displayName: product.title,
                displayPrice: product.displayPrice,
                currency: product.currency,
                billingPeriod,
                periodUnit: unit,
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
            `Attempting purchase: id=${id}, hasOfferToken=${!!offerToken}, oldPlanId=${oldPlanId}, newPlanId=${newPlanId}`
        );

        const googleRequest: any =
            Platform.OS === 'android'
                ? {
                      skus: [id],
                      subscriptionOffers: [{ sku: id, offerToken: offerToken }],
                      subscriptionProductReplacementParams: undefined as any,
                  }
                : undefined;

        // On Android, and only when all the data needed for an upgrade/downgrade is present
        if (Platform.OS === 'android' && oldPlanId && newPlanId && googleRequest) {
            // Find the previous purchase using the sku
            this.logService.debug('IAP', 'Looking up existing purchase for plan change');
            const availablePurchases = await this.getAvailablePurchases();
            const oldPurchase = availablePurchases.find(p => p.productId === id);

            // If a previous purchase exists, add the upgrade/downgrade-related parameters
            if (oldPurchase) {
                googleRequest.subscriptionProductReplacementParams = {
                    oldPurchaseToken: oldPurchase.purchaseToken,
                    replacementMode: getReplacementMode(oldPlanId, newPlanId),
                };
            }
        }

        try {
            await requestPurchase({
                type: 'subs',
                request: {
                    apple: { sku: id, andDangerouslyFinishTransactionAutomatically: false },
                    google: googleRequest,
                },
            });
        } catch (error) {
            // The store's own refusal. The web records that a purchase failed, but only this layer
            // ever sees WHY — the catalog puts this entry in the service, not the bridge handler,
            // for that reason.
            this.logService.error('IAP', `Store refused purchase: id=${id}`, error as Error);
            throw error;
        }
    }

    public async finish(purchase: Purchase): Promise<Purchase> {
        try {
            await finishTransaction({ purchase, isConsumable: false });
        } catch (error) {
            // An unfinished transaction is re-presented by the store, which is how a purchase that
            // already validated turns into a second charge.
            this.logService.error('IAP', `Finish transaction failed: id=${purchase.productId}`, error as Error);
            throw error;
        }
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
