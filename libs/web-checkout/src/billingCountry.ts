import type { Currency, PaymentProvider } from './types';

export const KOREA = 'KR';

export const BILLING_COUNTRY_OPTIONS = ['KR', 'US', 'JP', 'OTHER'] as const;

export type BillingCountryOption = (typeof BILLING_COUNTRY_OPTIONS)[number];

export const isBillingCountry = (value: string): value is BillingCountryOption =>
    (BILLING_COUNTRY_OPTIONS as readonly string[]).includes(value);

export const currencyOfCountry = (country: string): Currency => (country === KOREA ? 'KRW' : 'USD');

export const billableIn = (country: string, foreignBilling: boolean): boolean => country === KOREA || foreignBilling;

export type ForeignBilling = 'reading' | 'open' | 'shut';

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

export const payerRequiredIn = (country: string): boolean => country === KOREA;

export const payerRequiredFor = (provider: PaymentProvider): boolean => provider === 'portone';

export const lockedCountryOf = (provider: PaymentProvider): BillingCountryOption =>
    provider === 'portone' ? KOREA : 'OTHER';

export const providerOfCountry = (country: string): PaymentProvider => (country === KOREA ? 'portone' : 'stripe');

export const providerOfCurrency = (currency: Currency): PaymentProvider => (currency === 'KRW' ? 'portone' : 'stripe');

export const currencyOfProvider = (provider: PaymentProvider): Currency => (provider === 'portone' ? 'KRW' : 'USD');

export const currencyOfLanguage = (language: string): Currency => (language.startsWith('ko') ? 'KRW' : 'USD');
