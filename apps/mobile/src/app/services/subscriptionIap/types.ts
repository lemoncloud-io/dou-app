import type { Purchase } from 'react-native-iap';
import type { IapProductSubscription } from '@chatic/bridge-messages';

export type { IapProductSubscription };

export interface ISubscriptionIapService {
    init(): Promise<boolean>;

    getAvailablePurchases(): Promise<Purchase[]>;

    getSubscriptions(): Promise<IapProductSubscription[]>;

    purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void>;

    finish(purchase: Purchase): Promise<Purchase>;

    linkToManageSubscriptions(): Promise<void>;
}
