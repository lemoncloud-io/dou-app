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

export const currencyOfCountry = (country: string): Currency => (country === KOREA ? 'KRW' : 'USD');

export const providerOfCountry = (country: string): PaymentProvider => (country === KOREA ? 'portone' : 'stripe');

export const providerOfCurrency = (currency: Currency): PaymentProvider => (currency === 'KRW' ? 'portone' : 'stripe');

export const currencyOfProvider = (provider: PaymentProvider): Currency => (provider === 'portone' ? 'KRW' : 'USD');

/**
 * The currency a visitor reads the plans in before any country is chosen: the page's language. Korean
 * readers see won and everyone else dollars; what is actually charged is settled by the billing country
 * at checkout.
 */
export const currencyOfLanguage = (language: string): Currency => (language.startsWith('ko') ? 'KRW' : 'USD');
