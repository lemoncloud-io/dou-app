import type { SubscriptionState, SubscriptionSummary } from './membershipStatus';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long the relay keeps an expired subscriber's clouds on hold before it hands their slots back.
 *
 * This is the relay's own constant (its `GRACE_MS.expired`), not a product decision written down
 * anywhere else, so it lives in one place here. The expired banner promises "subscribe again and
 * keep your clouds" only inside this window — past it the clouds have left the membership and a new
 * subscription does not bring them back. If the relay changes the number, this line changes with it.
 */
export const EXPIRED_HOLD_MS = 30 * DAY_MS;

/** The single status banner the detail screen shows, or none. Order of the union is priority. */
export type SubscriptionBanner = 'blocked' | 'expired' | 'cancelScheduled' | 'restored' | 'autoRenew';

export interface BannerInput {
    summary: SubscriptionSummary;
    /** `membership.autoRenewing`. `undefined` is read as "on" — only an explicit `false` turns it off. */
    autoRenewing?: boolean;
    /** The store gave us a price for the current plan. Off-native there is none, and no banner. */
    hasPrice: boolean;
    /** This session watched the subscription come back (see `isRestoreTransition`). */
    restored: boolean;
}

/**
 * Picks the one banner the detail screen leads with.
 *
 * Exactly one, by priority: a block outranks everything because the store keeps charging through
 * it; then the two endings; then the one-off "it came back" note; then the plain renewal reminder.
 * The renewal reminder needs a live receipt (a grant has no next charge) and a price (a reminder
 * without the amount is the part worth leaving out), and it steps aside while a tier change is
 * queued — the pending-change card already says what the next charge will be.
 */
export const deriveBanner = ({
    summary,
    autoRenewing,
    hasPrice,
    restored,
}: BannerInput): SubscriptionBanner | undefined => {
    switch (summary.state) {
        case 'blocked':
            return 'blocked';
        case 'expired':
            return 'expired';
        case 'cancelScheduled':
            return 'cancelScheduled';
        case 'active':
            if (restored) return 'restored';
            if (summary.hasLiveReceipt && !summary.pendingProductId && autoRenewing !== false && hasPrice) {
                return 'autoRenew';
            }
            return undefined;
        default:
            return undefined;
    }
};

/** Whether the expired banner may still promise that the old clouds come back. */
export const isWithinExpiredHold = (validUntil: number | undefined, now: number): boolean =>
    !!validUntil && validUntil + EXPIRED_HOLD_MS > now;

/** The tone a status word is painted in — `ProductCard`/`KeyValueRows` map these to colours. */
export type StatusTone = 'active' | 'scheduled' | 'ended' | 'danger';

export interface StatusWord {
    /** i18n key under `mypage.subscription.state.`. */
    key: 'active' | 'ending' | 'expired' | 'blocked' | 'scheduled';
    tone: StatusTone;
}

/**
 * The status word on the product card — what the plan itself is doing.
 *
 * A scheduled cancellation still reads "subscribed" here: the plan is running and paid for, and the
 * ending is the banner's and the info table's to say. Only a lapsed or blocked plan changes word.
 */
export const productStatusWord = (state: SubscriptionState): StatusWord => {
    if (state === 'expired') return { key: 'expired', tone: 'danger' };
    if (state === 'blocked') return { key: 'blocked', tone: 'danger' };
    return { key: 'active', tone: 'active' };
};

/**
 * The status row in the info table — what happens to the subscription as it stands.
 *
 * A queued downgrade reads "ending" too: the plan on screen stops at the next renewal, which is the
 * same fact a cancellation states, and the design draws both the same way.
 */
export const subscriptionStatusWord = (state: SubscriptionState, hasPendingChange: boolean): StatusWord => {
    if (state === 'expired') return { key: 'expired', tone: 'danger' };
    if (state === 'blocked') return { key: 'blocked', tone: 'danger' };
    if (state === 'cancelScheduled' || hasPendingChange) return { key: 'ending', tone: 'danger' };
    return { key: 'active', tone: 'active' };
};

/** One row of the subscription info table, in the order the design lists them. */
export type InfoRow =
    | 'status'
    | 'price'
    | 'period'
    | 'nextPayment'
    | 'endsOn'
    | 'expiredOn'
    | 'scheduledPrice'
    | 'platform'
    | 'adminGrant';

/**
 * Which rows the info table shows. Every date row is `validUntil` under a different name — the
 * state decides which name is true: the next charge, the last day of a run that will not renew, or
 * the day it lapsed. Showing all three would make the reader work out which one applies.
 */
export const deriveInfoRows = (
    state: SubscriptionState,
    hasPendingChange: boolean,
    isAdminOverridden: boolean
): InfoRow[] => {
    const rows: InfoRow[] = ['status', 'price', 'period'];
    if (state === 'active' && !hasPendingChange) rows.push('nextPayment', 'scheduledPrice');
    else if (state === 'active' || state === 'cancelScheduled') rows.push('endsOn');
    else if (state === 'expired') rows.push('expiredOn');
    rows.push('platform');
    if (isAdminOverridden) rows.push('adminGrant');
    return rows;
};

/**
 * Whole days until `target`, rounded up, or `undefined` once it has passed.
 *
 * Measured against the device clock, so it can be a day off the relay's own verdict around
 * midnight. That is acceptable for a countdown chip — it informs, it does not decide anything.
 */
export const daysUntil = (target: number | undefined, now: number): number | undefined => {
    if (!target) return undefined;
    const days = Math.ceil((target - now) / DAY_MS);
    return days > 0 ? days : undefined;
};

/**
 * A subscription coming back within one session: an ending (scheduled or done) turning into a
 * running plan again, typically after the user turned auto-renew back on in the store and returned.
 *
 * The relay keeps no "recently restored" flag, so this is the only way the app knows — and it only
 * knows when it saw both sides. A reinstall or another device never shows the note.
 */
export const isRestoreTransition = (previous: SubscriptionState | undefined, next: SubscriptionState): boolean =>
    (previous === 'cancelScheduled' || previous === 'expired') && next === 'active';
