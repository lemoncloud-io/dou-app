import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';

export type AndroidOfferTokens = {
    freeTrial: string | null; // Token for the free-trial offer
    base: string | null; // Token for the regular-billing offer
};

/**
 * Unified iOS/Android subscription product type
 */
export type IapProductSubscription = ProductSubscription & {
    /**
     * The subscription product id actually used for the purchase
     */
    id: string;
    /**
     * Android-only plan id
     * The sub-plan value under the subscription product
     */
    basePlanId?: string;

    /**
     * Product name (e.g. product.title)
     */
    displayName?: string | null;
    /**
     * Formatted price (e.g. ₩10,000)
     */
    displayPrice: string;
    /**
     * Currency unit (e.g. KRW)
     */
    currency: string;

    /**
     * The unified billing period (ISO 8601 format: e.g., 'P1M', 'P1Y').
     * Useful for logic checks and mapping translations.
     */
    billingPeriod?: string;

    /**
     * The unit of the subscription period.
     */
    periodUnit?: 'year' | 'month' | 'week' | 'day';

    /**
     * The number of units in the subscription period (e.g., 1, 12).
     */
    periodNumber?: number;

    /**
     * (Android only)
     * List of subscription offer tokens.
     * Must be selected based on free-trial eligibility, so this is required.
     */
    androidOfferToken?: AndroidOfferTokens;
};

/**
 * Purchase request payload
 */
export type PurchasePayload = {
    /** * Product ID (SKU)
     * iOS: unique product identifier
     * Android: top-level parent product ID (productId)
     **/
    id: string;

    /**
     * (Android required) The specific offer token to purchase
     * Carries the free-trial eligibility and plan info within it
     **/
    offerToken?: string;

    /**
     * (Android only) The plan ID (basePlanId) of the currently subscribed plan
     * The existing plan's ID, used to determine upgrade/downgrade
     **/
    oldPlanId?: string;

    /**
     * (Android only) The plan ID (basePlanId) of the plan being newly purchased
     * Used for tier comparison
     **/
    newPlanId?: string;
};

/** [Request] Fetch subscription product list payload */
export type FetchProductsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Fetch in-app purchase history payload */
export type FetchCurrentPurchasesPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Open subscription management screen payload */
export type OpenSubscriptionManagementPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] In-app purchase request event payload */
export type OnPurchasePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Open subscription management screen result payload */
export type OnOpenSubscriptionManagementPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * Request payload to finish processing a purchase transaction
 * Caution: skipping this call after processing a purchase results in a refund
 */
export type FinishPurchaseTransactionPayload = {
    purchase: Purchase;
};

/**
 * Payload returning in-app purchase subscription product info
 */
export type OnFetchProductsPayload = {
    products: IapProductSubscription[];
};

/**
 * Payload returning in-app purchase history info
 */
export type OnFetchCurrentPurchasesPayload = {
    purchases: Purchase[];
};

/**
 * In-app purchase success payload
 */
export type OnPurchaseSuccessPayload = {
    purchase: Purchase;
};

/**
 * In-app purchase error payload
 */
export type OnPurchaseErrorPayload = {
    error: PurchaseError;
};

/**
 * Payload for the result of finishing a purchase transaction
 */
export type OnFinishPurchaseTransactionPayload = {
    purchase: Purchase;
};
