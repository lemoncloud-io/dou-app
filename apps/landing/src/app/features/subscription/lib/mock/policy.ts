import type { Plan } from '../../types';

/**
 * Every billing rule the mock applies, in one place.
 *
 * Several of these are proposals still waiting on a product decision. When one is settled, this file
 * is the only thing that changes — no screen carries a price, a period or a count of its own; they
 * read them from what the port returns.
 */
export const MOCK_POLICY = {
    /** Monthly price per tier step, VAT included: DoU Cloud n costs n times this. */
    pricePerTier: 8600,
    currency: 'KRW',
    /** The free trial on a first subscription. */
    trialDays: 7,
    /** Days after a failed renewal on which the charge is retried (proposal). */
    retryAfterDays: [1, 3, 5],
    /** Days after a failed renewal on which access is restricted (proposal). */
    restrictAfterDays: 7,
    /** Billing addresses per account, the primary one included (proposal). */
    maxBillingEmails: 5,
    /** Failed card registrations before registering is refused for a while (proposal). */
    maxCardAttempts: 5,
    /** Days after expiry within which subscribing again restores the held clouds (current server rule). */
    restoreWindowDays: 30,
    /** The verification code the mock accepts for any billing email. */
    emailCode: '123456',
    /** How long a code works, in minutes. */
    emailCodeMinutes: 5,
    /** Wrong entries one code allows. */
    emailCodeAttempts: 5,
    /** Seconds between two codes for the same address. */
    emailResendSeconds: 60,
    /** Codes one address may be sent before it is locked. */
    emailResends: 5,
    /** Minutes an address stays locked after its codes run out. */
    emailLockMinutes: 10,
    /** Throwaway mail domains refused for billing mail. */
    disposableEmailDomains: ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com'],
    /** How long an unfinished sign-in stays valid (proposal). */
    signInAttemptMinutes: 10,
} as const;

const SORTS = [1, 2, 3, 4, 5] as const;

export const MOCK_PLANS: Plan[] = SORTS.map(sort => ({
    id: `pro-tier-0${sort}` as Plan['id'],
    sort,
    maxClouds: sort,
    monthly: { amount: MOCK_POLICY.pricePerTier * sort, currency: MOCK_POLICY.currency },
    trialDays: MOCK_POLICY.trialDays,
}));

export const planOf = (id: Plan['id']): Plan => {
    const plan = MOCK_PLANS.find(p => p.id === id);
    if (!plan) throw new Error(`unknown plan ${id}`);
    return plan;
};
