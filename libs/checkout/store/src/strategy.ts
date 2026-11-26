import type { Logger } from '@chatic/logger';
import type { StoreName, StoreProduct, StorePurchase, StorePurchaseRequest } from '@chatic/ports';
import type { RequestSubscriptionIosProps, RequestSubscriptionPropsByPlatforms } from 'react-native-iap';

export interface StorePurchaseContext {
    readonly logger: Logger;
    currentPurchases(): Promise<StorePurchase[]>;
}

export interface StoreStrategy {
    readonly store: StoreName;
    readonly skus: readonly string[];
    readonly managementUrl: string;
    products(fetched: readonly object[]): StoreProduct[];
    check(request: StorePurchaseRequest): void;
    purchaseRequest(
        request: StorePurchaseRequest,
        context: StorePurchaseContext
    ): Promise<RequestSubscriptionPropsByPlatforms>;
}

export const appleSubscriptionRequest = (id: string): RequestSubscriptionIosProps => ({
    sku: id,
    andDangerouslyFinishTransactionAutomatically: false,
});
