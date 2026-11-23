import type { SubscriptionState, SubscriptionSummary } from './membershipStatus';

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPIRED_HOLD_MS = 30 * DAY_MS;

export type SubscriptionBanner = 'blocked' | 'expired' | 'cancelScheduled' | 'restored' | 'autoRenew';

export interface BannerInput {
    summary: SubscriptionSummary;
    autoRenewing?: boolean;
    hasPrice: boolean;
    restored: boolean;
}

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

export type CloudManageBanner = 'blocked' | 'expired' | 'pendingChange';

export const deriveCloudManageBanner = (
    state: SubscriptionState,
    hasPendingChange: boolean
): CloudManageBanner | undefined => {
    if (state === 'blocked') return 'blocked';
    if (state === 'expired') return 'expired';
    if (hasPendingChange) return 'pendingChange';
    return undefined;
};

export const isWithinExpiredHold = (validUntil: number | undefined, now: number): boolean =>
    !!validUntil && validUntil + EXPIRED_HOLD_MS > now;

export type StatusTone = 'active' | 'scheduled' | 'ended' | 'danger';

export interface StatusWord {
    key: 'active' | 'ending' | 'expired' | 'blocked' | 'scheduled';
    tone: StatusTone;
}

export const productStatusWord = (state: SubscriptionState): StatusWord => {
    if (state === 'expired') return { key: 'expired', tone: 'danger' };
    if (state === 'blocked') return { key: 'blocked', tone: 'danger' };
    return { key: 'active', tone: 'active' };
};

export const subscriptionStatusWord = (state: SubscriptionState, hasPendingChange: boolean): StatusWord => {
    if (state === 'expired') return { key: 'expired', tone: 'danger' };
    if (state === 'blocked') return { key: 'blocked', tone: 'danger' };
    if (state === 'cancelScheduled' || hasPendingChange) return { key: 'ending', tone: 'danger' };
    return { key: 'active', tone: 'active' };
};

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

export const daysUntil = (target: number | undefined, now: number): number | undefined => {
    if (!target) return undefined;
    const days = Math.ceil((target - now) / DAY_MS);
    return days > 0 ? days : undefined;
};

export const isRestoreTransition = (previous: SubscriptionState | undefined, next: SubscriptionState): boolean =>
    (previous === 'cancelScheduled' || previous === 'expired') && next === 'active';
