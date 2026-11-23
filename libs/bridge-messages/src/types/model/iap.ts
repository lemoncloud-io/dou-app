import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';

export type AndroidOfferTokens = {
    freeTrial: string | null;
    base: string | null;
};

export type IapProductSubscription = ProductSubscription & {
    id: string;
    basePlanId?: string;

    displayName?: string | null;
    displayPrice: string;
    currency: string;

    billingPeriod?: string;

    periodUnit?: 'year' | 'month' | 'week' | 'day';

    periodNumber?: number;

    androidOfferToken?: AndroidOfferTokens;
};

export type PurchasePayload = {
    id: string;

    offerToken?: string;

    oldPlanId?: string;

    newPlanId?: string;
};

export type FetchProductsPayload = {};

export type FetchCurrentPurchasesPayload = {};

export type OpenSubscriptionManagementPayload = {};

export type OnPurchasePayload = {};

export type OnOpenSubscriptionManagementPayload = {};

export type FinishPurchaseTransactionPayload = {
    purchase: Purchase;
};

export type OnFetchProductsPayload = {
    products: IapProductSubscription[];
};

export type OnFetchCurrentPurchasesPayload = {
    purchases: Purchase[];
};

export type OnPurchaseSuccessPayload = {
    purchase: Purchase;
};

export type OnPurchaseErrorPayload = {
    error: PurchaseError;
};

export type OnFinishPurchaseTransactionPayload = {
    purchase: Purchase;
};
