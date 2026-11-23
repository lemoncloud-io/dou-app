import type { WebMessageResponse } from '@chatic/bridge-messages';

export type NativePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

export interface PurchaseError {
    code: string;
    message?: string;
}

export interface PurchaseProduct {
    id: string;
    newPlanId?: string;
    offerToken?: string;
    oldPlanId?: string;
}

export enum PageState {
    Idle = 'idle',
    Fetching = 'fetching',
    Purchasing = 'purchasing',
}
