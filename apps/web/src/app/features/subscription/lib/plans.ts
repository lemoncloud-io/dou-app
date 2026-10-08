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

/**
 * Whether the catalog sells a tier above the one in force — what decides which "no more clouds"
 * dialog the add-cloud flow shows: an offer to change the plan, or a plain "this is the most".
 * An unresolved current plan reads as "a higher tier may exist", so the offer is made; the picker
 * then applies the real adjacency rules.
 */
export const hasHigherTier = (current: ProductView | undefined, sellable: ProductView[]): boolean =>
    sellable.some(plan => (plan.sort ?? 0) > (current?.sort ?? 0));

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
 * Whether `target` is sold on a different store from the one that bills `current`.
 *
 * A subscription can only be changed on the store that bills it. The other store knows nothing of
 * it: a "tier change" there is a second, unrelated subscription, and the user ends up paying both
 * stores every month. The ids differ between the stores as well, so without this the plan a user
 * is on reads as some other tier and its neighbours as upgrades and downgrades.
 */
export const isOtherStorePlan = (current: ProductView, target: ProductView): boolean =>
    !!current.platform && !!target.platform && current.platform !== target.platform;

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
    // The other store's tiers are recognised by rank, never sold — see `isOtherStorePlan`.
    if (isOtherStorePlan(current, target)) return current.sort === target.sort ? 'current' : 'blocked';
    const step = (target.sort ?? 0) - (current.sort ?? 0);
    if (step === 1) return 'upgrade';
    if (step === -1) return 'downgrade';
    return 'blocked';
};

/** Selectable in the picker — `current` is shown as already-owned rather than as a choice. */
export const isSelectableTier = (kind: TierChangeKind): boolean =>
    kind === 'new' || kind === 'upgrade' || kind === 'downgrade';

/** Why a tier cannot be picked. The discriminant the refusal dialog turns into copy. */
export type TierRefusal = 'current' | 'tierJump' | 'entryTier' | 'otherStore';

/**
 * The refusal behind an unpickable tier, or `undefined` when the tier can be picked.
 *
 * `blocked` covers three different refusals that read nothing alike to the user: without a running
 * subscription it is the entry-tier rule, with one bought on the other store it is that store's to
 * change, and otherwise it is a tier jump (see `getTierChangeKind`). Splitting them here is what
 * lets the dialog explain the actual rule instead of one blanket line.
 */
export const getTierRefusal = (
    current: ProductView | undefined,
    kind: TierChangeKind,
    target: ProductView
): TierRefusal | undefined => {
    if (kind === 'current') return 'current';
    if (kind !== 'blocked') return undefined;
    if (!current) return 'entryTier';
    return isOtherStorePlan(current, target) ? 'otherStore' : 'tierJump';
};

/**
 * The pickable tier nearest to the one the user tapped — what the refusal dialog offers instead.
 *
 * Distance is in tier steps, and a tie goes to the lower tier: when a refused pick sits between two
 * pickable ones, the cheaper of the two is the safer thing to nudge someone towards. Returns
 * `undefined` when nothing is pickable at all (an expired catalog, a single-plan build).
 */
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
