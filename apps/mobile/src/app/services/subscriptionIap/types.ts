import type { Purchase } from 'react-native-iap';
import type { IapProductSubscription } from '@chatic/app-messages';

export type { IapProductSubscription };

export interface ISubscriptionIapService {
    /** Initializes the in-app purchase module */
    init(): Promise<boolean>;

    /**
     * Fetches the user's past purchase history (receipts) from the store.
     */
    getAvailablePurchases(): Promise<Purchase[]>;

    /**
     * Loads the list of subscription products
     */
    getSubscriptions(): Promise<IapProductSubscription[]>;

    /**
     * Requests a purchase
     * @param id product code (sku)
     * @param offerToken (Android, required) the offer token to purchase
     * @param oldPlanId (Android) the currently subscribed plan ID (basePlanId)
     * @param newPlanId (Android) the plan ID being purchased (basePlanId) - used to determine upgrade/downgrade
     */
    purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void>;

    /**
     * Processes the subscription completion transaction
     * @param purchase the purchase info
     */
    finish(purchase: Purchase): Promise<Purchase>;

    /**
     * Navigates to the manage subscriptions page
     */
    linkToManageSubscriptions(): Promise<void>;
}
