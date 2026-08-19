/**
 * What the user is charged, as the store words it.
 *
 * The store is the only source. `IapProductSubscription.displayPrice` arrives already localized and
 * tax-inclusive for this storefront — `₩8,600` in Korea, `$6.99` in the US — and both stores require
 * the displayed price to be theirs.
 *
 * `ProductModel.price` is a USD reference value the server keeps for its own bookkeeping; it is
 * deliberately NOT used as a fallback. Rendering it would show a Korean subscriber dollars for a
 * charge their store takes in won, and there is no exchange rate the app could apply that would
 * stay true. Absent a store price the caller shows nothing — which is only the web build, where
 * nothing can be bought anyway.
 */
export const formatPlanPrice = (displayPrice: string | undefined): string | undefined => displayPrice || undefined;
