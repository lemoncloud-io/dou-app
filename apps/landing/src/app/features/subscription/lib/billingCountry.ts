import type { Currency, PaymentProvider } from '../types';

/**
 * Which way a payment goes, decided by the billing country alone. DoU is sold internationally, so the
 * split is not by the kind of card but by where the reader is billed: Korea is billed in won, every
 * other country in US dollars, and each currency has its own payment provider behind it. The screens
 * name the country and the currency, never the provider.
 */

/** The billing country that is billed in won. */
export const KOREA = 'KR';

/** What the country picker offers, Korea first. `OTHER` stands for every country not listed. */
export const BILLING_COUNTRY_OPTIONS = ['KR', 'US', 'JP', 'OTHER'] as const;

export type BillingCountryOption = (typeof BILLING_COUNTRY_OPTIONS)[number];

export const isBillingCountry = (value: string): value is BillingCountryOption =>
    (BILLING_COUNTRY_OPTIONS as readonly string[]).includes(value);

export const currencyOfCountry = (country: string): Currency => (country === KOREA ? 'KRW' : 'USD');

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
 * at checkout.
 */
export const currencyOfLanguage = (language: string): Currency => (language.startsWith('ko') ? 'KRW' : 'USD');
