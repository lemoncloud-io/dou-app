/**
 * What the user is actually charged, worded the way the store words it.
 *
 * The store's own string wins and is already localized — `₩8,600` in Korea, `$6.99` in the US —
 * and both stores require the displayed price to be theirs.
 *
 * `product.price` is a USD reference value; the server has no local-currency figure at all. So
 * where no store applies (the web build) it is formatted explicitly AS dollars rather than dressed
 * up in the reader's currency: `₩6` would simply be false, and baking an exchange rate into the app
 * would be worse. Showing a real ₩ figure off-native needs the backend to carry one.
 */
export const formatPlanPrice = (
    displayPrice: string | undefined,
    usdPrice: number | null | undefined,
    locale: string
): string | undefined => {
    if (displayPrice) return displayPrice;
    if (usdPrice == null) return undefined;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usdPrice);
};
