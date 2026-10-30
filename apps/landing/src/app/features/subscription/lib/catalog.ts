import type { Currency, Plan } from '../types';

/**
 * Monthly price per tier step in each currency's minor unit, VAT included: DoU Cloud n costs n times
 * this. Won is the Korean price; dollars are the app stores' price outside Korea ($6 a step).
 */
export const PRICE_PER_TIER: Record<Currency, number> = { KRW: 8600, USD: 600 };
/** The free trial on a first subscription. */
export const TRIAL_DAYS = 7;

const SORTS = [1, 2, 3, 4, 5] as const;

/**
 * The plans and their prices in one currency — the one list both ports read. The plans page shows
 * these on every host, including production before anything can be bought (see `createPortSetup`), so
 * a price here is a published price: change it only together with the stores' prices.
 */
export const planCatalogIn = (currency: Currency): Plan[] =>
    SORTS.map(sort => ({
        id: `pro-tier-0${sort}` as Plan['id'],
        sort,
        maxClouds: sort,
        monthly: { amount: PRICE_PER_TIER[currency] * sort, currency },
        trialDays: TRIAL_DAYS,
    }));

/** The catalog in won, the currency every list starts from when nothing says otherwise. */
export const PLAN_CATALOG: Plan[] = planCatalogIn('KRW');
