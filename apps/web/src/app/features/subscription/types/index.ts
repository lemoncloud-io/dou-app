import type { WebMessageResponse } from '@chatic/app-messages';

// Derive the native purchase type from the response contract to stay in sync.
export type NativePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

export interface PurchaseError {
    code: string;
    message?: string;
}

export interface PurchaseProduct {
    id: string;
    newPlanId?: string;
    offerToken?: string;
    /**
     * (Android) the base plan being replaced. Android derives the replacement mode from old-vs-new
     * plan rank, so a tier change without this is booked as a brand-new subscription.
     */
    oldPlanId?: string;
}

/** UI state for the subscription plans page purchase flow. */
export enum PageState {
    Idle = 'idle',
    Fetching = 'fetching',
    Purchasing = 'purchasing',
}
