import type { ProductView } from '@lemoncloud/chatic-backend-api';

/** The two stores we sell through; `undefined` off-native, where no store product applies. */
export type StorePlatform = 'apple' | 'google';

/** What selecting a plan would do, given what the user is on right now. */
export type TierChangeKind = 'new' | 'current' | 'upgrade' | 'downgrade' | 'blocked';

/**
 * Server product ids carry a `#` prefix (`#pro-tier-01`); the stores speak the bare form, which is
 * also the key in the backend's `product-config.json`.
 */
export const stripPlanId = (productId?: string | null): string => (productId ?? '').replace(/^#/, '');

/** Ascending by the server's own `sort` — tier1 first. */
export const sortPlansByTier = (plans: ProductView[]): ProductView[] =>
    [...plans].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

/**
 * The plans this build may actually sell.
 *
 * `GET /products/plans` is fetched WITHOUT the `platform` filter (see `usePlanCatalog`), so the
 * filter happens here. Off-native there is no store and therefore nothing sellable — returning the
 * unfiltered list would advertise one store's prices and trial to a visitor on the other.
 */
export const selectSellablePlans = (plans: ProductView[], platform: StorePlatform | undefined): ProductView[] =>
    platform ? sortPlansByTier(plans.filter(p => p.platform === platform)) : [];

/** Joins a `#`-prefixed product id (a membership's `productId`, say) back to its plan. */
export const findPlanById = (plans: ProductView[], productId?: string | null): ProductView | undefined => {
    const key = stripPlanId(productId);
    return key ? plans.find(p => stripPlanId(p.id) === key) : undefined;
};

/**
 * The cloud allowance behind a membership, or `null` when the app cannot resolve it.
 *
 * It comes from the plan list, NOT from `membership.product$` — the backend attaches the product as
 * a *head* (`asHead`, `proxy.ts:1060`), which carries only `id`/`name`/`nameEn`/`platform`. Reading
 * `product$.maxClouds` compiles (the view type is the wider `ProductView`) and is `undefined` at
 * runtime, which is the worst kind of wrong: silently indistinguishable from "no allowance".
 *
 * `null` means unknown — a super membership (granted, so no product) or an id the catalog has not
 * loaded. Callers must not read it as zero.
 */
export const resolveMaxClouds = (plans: ProductView[], productId?: string | null): number | null =>
    findPlanById(plans, productId)?.maxClouds ?? null;

/** The tier every subscription starts on. */
export const ENTRY_TIER_SORT = 1;

/**
 * Adjacency is purely an app policy — neither store enforces it, and the backend's `calcNeededClouds`
 * only does the arithmetic. The reason is that every cloud carries its own email verification, so a
 * tier1 → tier3 jump would ask for two verifications back to back; downgrades are locked to one step
 * for as long as there is no UI to release the clouds a multi-step drop would strand.
 *
 * The same rule governs the first purchase: a new subscription starts on the entry tier and climbs
 * one step at a time. Selling tier 5 outright would hand someone an allowance for five clouds and
 * five email verifications to work through before any of it is usable.
 */
export const getTierChangeKind = (current: ProductView | undefined, target: ProductView): TierChangeKind => {
    if (!current) return (target.sort ?? 0) === ENTRY_TIER_SORT ? 'new' : 'blocked';
    if (stripPlanId(current.id) === stripPlanId(target.id)) return 'current';
    const step = (target.sort ?? 0) - (current.sort ?? 0);
    if (step === 1) return 'upgrade';
    if (step === -1) return 'downgrade';
    return 'blocked';
};

/** Selectable in the picker — `current` is shown as already-owned rather than as a choice. */
export const isSelectableTier = (kind: TierChangeKind): boolean =>
    kind === 'new' || kind === 'upgrade' || kind === 'downgrade';

/**
 * The plan's name in the reader's language, falling back through the other locale to the raw id.
 *
 * The id is a last resort, not a display value — `#pro-tier-01` reaching a screen means the catalog
 * join failed, and it should look like the failure it is rather than like a product name.
 */
export const planDisplayName = (plan: ProductView | undefined, isKo: boolean): string | undefined => {
    if (!plan) return undefined;
    return (isKo ? (plan.name ?? plan.nameEn) : (plan.nameEn ?? plan.name)) ?? plan.id;
};
