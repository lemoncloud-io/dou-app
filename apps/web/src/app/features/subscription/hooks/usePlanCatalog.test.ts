import { renderHook } from '@testing-library/react';

import { usePlanCatalog } from './usePlanCatalog';
import { useMembershipInfo, useProductPlans } from '../../../hooks/useMembership';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn(), useProductPlans: jest.fn() }));

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;

const storeTier = (sort: number, platform: 'apple' | 'google') => ({
    id: platform === 'apple' ? `#pro_tier_0${sort}_dev` : `#pro-tier-0${sort}-dev`,
    name: `DoU Cloud ${sort}`,
    platform,
    sort,
    maxClouds: sort,
    trialDays: sort === 1 ? 7 : 0,
});
const webTier = (sort: number) => ({
    id: `#dou-web-stripe-tier-0${sort}_dev`,
    name: `DoU Cloud ${sort}`,
    platform: 'stripe',
    sort,
    maxClouds: sort,
    trialDays: sort === 1 ? 7 : 0,
});
const STORE_PLANS = [storeTier(1, 'apple'), storeTier(2, 'apple'), storeTier(1, 'google'), storeTier(2, 'google')];
const STRIPE_PLANS = [webTier(1), webTier(2)];

/** The relay as it answers today: the unfiltered list leaves the website's products out. */
const answerPlans = () =>
    (useProductPlans as jest.Mock).mockImplementation(
        (params: { platform?: string }, options?: { enabled?: boolean }) => {
            if (options?.enabled === false) return { data: undefined, isLoading: false };
            if (params.platform === 'stripe') return { data: { list: STRIPE_PLANS }, isLoading: false };
            return { data: { list: STORE_PLANS }, isLoading: false };
        }
    );

const catalogFor = (membership: Record<string, unknown>) => {
    (useMembershipInfo as jest.Mock).mockReturnValue({ data: membership, isLoading: false });
    return renderHook(() => usePlanCatalog()).result.current;
};

const running = (productId: string, platform: string) => ({
    productId,
    platform,
    status: 'active',
    isValid: true,
    validFrom: NOW - 2 * DAY,
    validUntil: NOW + 28 * DAY,
    autoRenewing: true,
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNative = true;
    (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM = 'ios';
    answerPlans();
});

afterEach(() => jest.restoreAllMocks());

describe('usePlanCatalog — a membership the website bills', () => {
    it("resolves its plan from its provider's list: name, allowance and trial", () => {
        const catalog = catalogFor(running('#dou-web-stripe-tier-02_dev', 'stripe'));

        expect(useProductPlans).toHaveBeenCalledWith({ limit: -1, platform: 'stripe' }, { enabled: true });
        expect(catalog.currentPlan?.name).toBe('DoU Cloud 2');
        expect(catalog.currentPlan?.maxClouds).toBe(2);
        expect(catalog.replaceablePlan?.id).toBe('#dou-web-stripe-tier-02_dev');
    });

    it('resolves a pending plan from the same list', () => {
        const catalog = catalogFor({
            ...running('#dou-web-stripe-tier-02_dev', 'stripe'),
            pendingProductId: '#dou-web-stripe-tier-01_dev',
        });

        expect(catalog.pendingPlan?.name).toBe('DoU Cloud 1');
    });

    it('reads the trial off the website plan it bought', () => {
        const catalog = catalogFor({
            ...running('#dou-web-stripe-tier-01_dev', 'stripe'),
            validFrom: NOW - DAY,
            trialUsed: true,
        });

        expect(catalog.summary.trialDaysLeft).toBe(6);
    });

    it("still sells only this build's store tiers, and counts the website as another store", () => {
        const catalog = catalogFor(running('#dou-web-stripe-tier-01_dev', 'stripe'));

        expect(catalog.sellablePlans.map(plan => plan.platform)).toEqual(['apple', 'apple']);
        expect(catalog.isOtherStore).toBe(true);
    });
});

describe('usePlanCatalog — anyone else', () => {
    it('makes no second call for a store subscription', () => {
        const catalog = catalogFor(running('#pro_tier_01_dev', 'apple'));

        expect(useProductPlans).toHaveBeenCalledWith({ limit: -1, platform: undefined }, { enabled: false });
        expect(catalog.currentPlan?.platform).toBe('apple');
        expect(catalog.catalogPlans).toEqual(STORE_PLANS);
    });

    it('makes no second call with no subscription at all', () => {
        catalogFor({ isValid: false });

        expect(useProductPlans).toHaveBeenCalledWith({ limit: -1, platform: undefined }, { enabled: false });
    });
});
