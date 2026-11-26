import { Linking } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    requestPurchase,
} from 'react-native-iap';
import type { Logger } from '@chatic/logger';
import type { StoreProduct, StorePurchase } from '@chatic/ports';

import type { StoreStrategy } from './strategy';
import type { ISubscriptionIapService } from './types';

export class SubscriptionIapService implements ISubscriptionIapService {
    constructor(
        private readonly logService: Logger,
        private readonly store: StoreStrategy
    ) {}

    public async init(): Promise<boolean> {
        try {
            return await initConnection();
        } catch (error) {
            this.logService.error('IAP', 'Store connection failed', error as Error);
            throw error;
        }
    }

    public async getAvailablePurchases(): Promise<StorePurchase[]> {
        try {
            return await getAvailablePurchases();
        } catch (error) {
            this.logService.error('IAP', 'Failed to get available purchases', error as Error);
            return [];
        }
    }

    public async getSubscriptions(): Promise<StoreProduct[]> {
        if (this.store.skus.length === 0) return [];

        const products = await fetchProducts({ skus: [...this.store.skus], type: 'subs' });
        if (!products) return [];

        return this.store.products(products);
    }

    public async purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void> {
        const request = { id, offerToken, oldPlanId, newPlanId };
        this.store.check(request);

        this.logService.info(
            'IAP',
            `Attempting purchase: id=${id}, hasOfferToken=${!!offerToken}, oldPlanId=${oldPlanId}, newPlanId=${newPlanId}`
        );

        const storeRequest = await this.store.purchaseRequest(request, {
            logger: this.logService,
            currentPurchases: () => this.getAvailablePurchases(),
        });

        try {
            await requestPurchase({ type: 'subs', request: storeRequest });
        } catch (error) {
            this.logService.error('IAP', `Store refused purchase: id=${id}`, error as Error);
            throw error;
        }
    }

    public async finish(purchase: StorePurchase): Promise<StorePurchase> {
        try {
            await finishTransaction({ purchase, isConsumable: false });
        } catch (error) {
            this.logService.error('IAP', `Finish transaction failed: id=${purchase.productId}`, error as Error);
            throw error;
        }
        return purchase;
    }

    public async linkToManageSubscriptions(): Promise<void> {
        await Linking.openURL(this.store.managementUrl);
    }
}
