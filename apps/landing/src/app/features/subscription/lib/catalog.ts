import type { Plan } from '../types';

/** Monthly price per tier step, VAT included: DoU Cloud n costs n times this. */
export const PRICE_PER_TIER = 8600;
export const CATALOG_CURRENCY = 'KRW';
/** The free trial on a first subscription. */
export const TRIAL_DAYS = 7;

const SORTS = [1, 2, 3, 4, 5] as const;

/**
 * The plans and their prices — the one list both ports read. The plans page shows these on every host,
 * including production before anything can be bought (see `createPortSetup`), so a price here is a
 * published price: change it only together with the stores' prices.
 */
export const PLAN_CATALOG: Plan[] = SORTS.map(sort => ({
    id: `pro-tier-0${sort}` as Plan['id'],
    sort,
    maxClouds: sort,
    monthly: { amount: PRICE_PER_TIER * sort, currency: CATALOG_CURRENCY },
    trialDays: TRIAL_DAYS,
}));
