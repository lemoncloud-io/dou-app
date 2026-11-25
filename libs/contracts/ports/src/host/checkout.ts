// eslint-disable-next-line @nx/enforce-module-boundaries -- store product and purchase stay react-native-iap's own types until the checkout/store family owns them
import type { ProductSubscription, Purchase } from 'react-native-iap';

export type StoreName = 'apple' | 'google';

export type StoreOfferTokens = {
    freeTrial: string | null;
    base: string | null;
};

export type StoreProduct = ProductSubscription & {
    id: string;
    basePlanId?: string;

    displayName?: string | null;
    displayPrice: string;
    currency: string;

    billingPeriod?: string;

    periodUnit?: 'year' | 'month' | 'week' | 'day';

    periodNumber?: number;

    androidOfferToken?: StoreOfferTokens;
};

export type StorePurchase = Purchase;

export interface StorePurchaseRequest {
    id: string;
    newPlanId?: string;
    offerToken?: string;
    oldPlanId?: string;
}

export interface StorePurchaseError {
    code: string;
    message?: string;
}

export interface StoreCheckout {
    readonly kind: 'store';
    readonly store: StoreName;
    products(): Promise<StoreProduct[]>;
    purchase(request: StorePurchaseRequest): Promise<StorePurchase>;
    finish(purchase: StorePurchase): Promise<void>;
    currentPurchases(): Promise<StorePurchase[]>;
    openManagement(): void;
}

export interface WebCheckout {
    readonly kind: 'web';
    open(url: string, options?: { replace?: boolean }): void;
}

export interface NoCheckout {
    readonly kind: 'none';
}

export type CheckoutPort = StoreCheckout | WebCheckout | NoCheckout;

export type CheckoutMethod = StoreName | 'web' | 'none';
