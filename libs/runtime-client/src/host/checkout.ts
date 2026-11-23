import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';

export type StoreName = 'apple' | 'google';

export type StorePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

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
    products(): Promise<IapProductSubscription[]>;
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
