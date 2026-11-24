import { PLAN_CATALOG, PRICE_PER_TIER, TRIAL_DAYS, planCatalogIn } from '@chatic/web-checkout';

import type { Currency, Plan } from '@chatic/web-checkout';

export const MOCK_POLICY = {
    pricePerTier: PRICE_PER_TIER,
    trialDays: TRIAL_DAYS,
    retryAfterDays: [1, 3, 5],
    restrictAfterDays: 7,
    maxBillingEmails: 5,
    maxCardAttempts: 5,
    restoreWindowDays: 30,
    emailCode: '123456',
    emailCodeMinutes: 5,
    emailCodeAttempts: 5,
    emailResendSeconds: 60,
    emailResends: 5,
    emailLockMinutes: 10,
    disposableEmailDomains: ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com'],
    signInAttemptMinutes: 10,
} as const;

export const MOCK_PLANS: Plan[] = PLAN_CATALOG;

export const planOf = (id: Plan['id'], currency: Currency = 'KRW'): Plan => {
    const plan = planCatalogIn(currency).find(p => p.id === id);
    if (!plan) throw new Error(`unknown plan ${id}`);
    return plan;
};
