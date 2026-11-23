import type { ProductView } from '@lemoncloud/chatic-backend-api';

export type StorePlatform = 'apple' | 'google';

export type TierChangeKind = 'new' | 'current' | 'upgrade' | 'downgrade' | 'blocked';

export const stripPlanId = (productId?: string | null): string => (productId ?? '').replace(/^#/, '');

export const sortPlansByTier = (plans: ProductView[]): ProductView[] =>
    [...plans].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

export const selectSellablePlans = (plans: ProductView[], platform: StorePlatform | undefined): ProductView[] =>
    platform ? sortPlansByTier(plans.filter(p => p.platform === platform)) : [];

export const hasHigherTier = (current: ProductView | undefined, catalog: ProductView[]): boolean =>
    catalog.some(plan => (plan.sort ?? 0) > (current?.sort ?? 0));

export const findPlanById = (plans: ProductView[], productId?: string | null): ProductView | undefined => {
    const key = stripPlanId(productId);
    return key ? plans.find(p => stripPlanId(p.id) === key) : undefined;
};

export const resolveMaxClouds = (plans: ProductView[], productId?: string | null): number | null =>
    findPlanById(plans, productId)?.maxClouds ?? null;

export const ENTRY_TIER_SORT = 1;

export const isOtherStorePlan = (current: ProductView, target: ProductView): boolean =>
    !!current.platform && !!target.platform && current.platform !== target.platform;

export const findResubscribePlan = (
    lapsed: ProductView | undefined,
    sellable: ProductView[]
): ProductView | undefined => (lapsed?.sort != null ? sellable.find(plan => plan.sort === lapsed.sort) : undefined);

export const getTierChangeKind = (
    current: ProductView | undefined,
    target: ProductView,
    resubscribe?: ProductView
): TierChangeKind => {
    if (!current) return (target.sort ?? 0) === (resubscribe?.sort ?? ENTRY_TIER_SORT) ? 'new' : 'blocked';
    if (stripPlanId(current.id) === stripPlanId(target.id)) return 'current';
    if (isOtherStorePlan(current, target)) return current.sort === target.sort ? 'current' : 'blocked';
    const step = (target.sort ?? 0) - (current.sort ?? 0);
    if (step === 1) return 'upgrade';
    if (step === -1) return 'downgrade';
    return 'blocked';
};

export const isSelectableTier = (kind: TierChangeKind): boolean =>
    kind === 'new' || kind === 'upgrade' || kind === 'downgrade';

export type TierRefusal = 'current' | 'tierJump' | 'entryTier' | 'resubscribeSame' | 'otherStore';

export const getTierRefusal = (
    current: ProductView | undefined,
    kind: TierChangeKind,
    target: ProductView,
    resubscribe?: ProductView
): TierRefusal | undefined => {
    if (kind === 'current') return 'current';
    if (kind !== 'blocked') return undefined;
    if (!current) return resubscribe ? 'resubscribeSame' : 'entryTier';
    return isOtherStorePlan(current, target) ? 'otherStore' : 'tierJump';
};

export const nearestSelectablePlan = <T extends { plan: ProductView; isSelectable: boolean }>(
    options: T[],
    target: ProductView
): T | undefined => {
    const targetSort = target.sort ?? 0;
    return options
        .filter(o => o.isSelectable)
        .sort((a, b) => {
            const aSort = a.plan.sort ?? 0;
            const bSort = b.plan.sort ?? 0;
            const byDistance = Math.abs(aSort - targetSort) - Math.abs(bSort - targetSort);
            return byDistance !== 0 ? byDistance : aSort - bSort;
        })[0];
};

export const planDisplayName = (plan: ProductView | undefined, isKo: boolean): string | undefined => {
    if (!plan) return undefined;
    return (isKo ? (plan.name ?? plan.nameEn) : (plan.nameEn ?? plan.name)) ?? plan.id;
};
