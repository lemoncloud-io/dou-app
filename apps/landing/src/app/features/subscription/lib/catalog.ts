import type { Currency, Plan } from '../types';

export const PRICE_PER_TIER: Record<Currency, number> = { KRW: 8900, USD: 680 };
export const TRIAL_DAYS = 7;

const SORTS = [1, 2, 3, 4, 5] as const;

export const planCatalogIn = (currency: Currency): Plan[] =>
    SORTS.map(sort => ({
        id: `pro-tier-0${sort}` as Plan['id'],
        sort,
        maxClouds: sort,
        monthly: { amount: PRICE_PER_TIER[currency] * sort, currency },
        trialDays: TRIAL_DAYS,
    }));

export const PLAN_CATALOG: Plan[] = planCatalogIn('KRW');
