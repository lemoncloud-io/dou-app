import type { Currency, PaymentProvider } from '../types';

/**
 * Which way a payment goes, decided by the billing country alone. DoU is sold internationally, so the
 * split is not by the kind of card but by where the reader is billed: Korea is billed in won, every
 * other country in US dollars, and each currency has its own payment provider behind it. The screens
 * name the country and the currency, never the provider.
 */

/** The billing country that is billed in won. */
export const KOREA = 'KR';

/**
 * What the country picker offers, Korea first, the same on every stage. `OTHER` stands for every country
 * not listed. India is deliberately not listed: its cards register, but its rules require a mandate for
 * charges made without the customer present, which this design cannot create, so the end of a trial and
 * every monthly charge would be refused. Leaving it out of the list does not stop a reader there picking
 * `OTHER`; only a server with no dollar products, which bills nothing outside Korea (`billableIn`), shuts that.
 */
export const BILLING_COUNTRY_OPTIONS = ['KR', 'US', 'JP', 'OTHER'] as const;

export type BillingCountryOption = (typeof BILLING_COUNTRY_OPTIONS)[number];

export const isBillingCountry = (value: string): value is BillingCountryOption =>
    (BILLING_COUNTRY_OPTIONS as readonly string[]).includes(value);

export const currencyOfCountry = (country: string): Currency => (country === KOREA ? 'KRW' : 'USD');

/**
 * Whether a checkout can go on with this billing country. Korea always can; any other country only where
 * billing outside Korea is open (`foreignBillingOf`) — not while the server has no dollar products, where
 * W-08 stops at a notice instead.
 */
export const billableIn = (country: string, foreignBilling: boolean): boolean => country === KOREA || foreignBilling;

/**
 * Whether billing outside Korea, in dollars, is open: `reading` until it is known, then `open` or `shut`.
 * Never open while it is being read — a page waits rather than show a state it may take back.
 */
export type ForeignBilling = 'reading' | 'open' | 'shut';

/**
 * Decides `ForeignBilling` from the server's own dollar catalog, and from nothing else. The server lists
 * a dollar product only once it can sell it, so a list with one in it is the server saying dollars are
 * ready — on any stage, the build has no say. One answer serves every page, so the plans page cannot
 * show dollars that the checkout then refuses.
 *
 * - `signedIn`: whether there is a session; `undefined` while it is being read. The server lists its
 *   products to a signed request only, so without a session there is nothing to judge by, and it is shut.
 * - `dollarPlans`: the dollar catalog once it is in. Empty is shut.
 * - `failed`: the read failed and no list is in. Shut, as an empty list would be: a checkout that cannot
 *   know must not take dollars.
 */
export const foreignBillingOf = ({
    signedIn,
    dollarPlans,
    failed,
}: {
    signedIn: boolean | undefined;
    dollarPlans: readonly unknown[] | undefined;
    failed: boolean;
}): ForeignBilling => {
    if (signedIn === undefined) return 'reading';
    if (!signedIn) return 'shut';
    if (dollarPlans) return dollarPlans.length > 0 ? 'open' : 'shut';
    return failed ? 'shut' : 'reading';
};

/**
 * Whether a card billed in this country is registered with the payer's name and mobile number. The won
 * provider's card company asks for both when the card is registered and again with every charge on it,
 * so in Korea they are required; the dollar provider asks for neither, so elsewhere there are no payer
 * fields at all.
 */
export const payerRequiredIn = (country: string): boolean => country === KOREA;

/** The same, for a card added to a subscription already charged by `provider`. */
export const payerRequiredFor = (provider: PaymentProvider): boolean => provider === 'portone';

/**
 * The billing country a running subscription is held to. A subscription stays with the provider that
 * charges it — a plan change or a new card cannot move it to the other currency — so its country is
 * shown fixed: Korea for won, and "another country" for dollars, since the dollar provider is not told
 * which.
 */
export const lockedCountryOf = (provider: PaymentProvider): BillingCountryOption =>
    provider === 'portone' ? KOREA : 'OTHER';

export const providerOfCountry = (country: string): PaymentProvider => (country === KOREA ? 'portone' : 'stripe');

export const providerOfCurrency = (currency: Currency): PaymentProvider => (currency === 'KRW' ? 'portone' : 'stripe');

export const currencyOfProvider = (provider: PaymentProvider): Currency => (provider === 'portone' ? 'KRW' : 'USD');

/**
 * The currency a visitor reads the plans in before any country is chosen: the page's language. Korean
 * readers see won and everyone else dollars; what is actually charged is settled by the billing country
 * at checkout. A signed-in reader sees the same unless dollars are shut (`foreignBillingOf`).
 */
export const currencyOfLanguage = (language: string): Currency => (language.startsWith('ko') ? 'KRW' : 'USD');
