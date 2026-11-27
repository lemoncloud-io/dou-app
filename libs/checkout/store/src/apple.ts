import type { StoreProduct } from '@chatic/ports';
import type { ProductSubscriptionIOS } from 'react-native-iap';

import { appleSubscriptionRequest } from './strategy';
import type { StoreStrategy } from './strategy';

export interface AppleStoreOptions {
    skus: readonly string[];
}

export const appleStore = ({ skus }: AppleStoreOptions): StoreStrategy => ({
    store: 'apple',
    skus,
    managementUrl: 'https://apps.apple.com/account/subscriptions',
    products: fetched =>
        (fetched as ProductSubscriptionIOS[]).map(product => {
            const num = product.subscriptionPeriodNumberIOS;
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
            } as StoreProduct;
        }),
    check: () => undefined,
    purchaseRequest: async ({ id }) => ({
        apple: appleSubscriptionRequest(id),
        google: undefined,
    }),
});
