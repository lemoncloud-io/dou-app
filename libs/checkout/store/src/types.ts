import type { StoreProduct, StorePurchase } from '@chatic/ports';

export interface ISubscriptionIapService {
    init(): Promise<boolean>;
    getAvailablePurchases(): Promise<StorePurchase[]>;
    getSubscriptions(): Promise<StoreProduct[]>;
    purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void>;
    finish(purchase: StorePurchase): Promise<StorePurchase>;
    linkToManageSubscriptions(): Promise<void>;
}
