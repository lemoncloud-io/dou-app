import type { CloudView } from '@lemoncloud/chatic-backend-api';

import type { SubscriptionState } from './membershipStatus';

/** Why "＋ 클라우드 추가" refuses. The button stays visible either way — we tell, not hide. */
export type CloudQuotaReason = 'notEntitled' | 'cancelScheduled' | 'limitReached';

export interface CloudQuotaVerdict {
    canAdd: boolean;
    reason?: CloudQuotaReason;
}

export interface CloudQuotaInput {
    used: number;
    /** `null` = the app could not resolve the allowance (see `resolveMaxClouds`). */
    limit: number | null;
    state: SubscriptionState;
}

/**
 * `GET /clouds/0/list?view=mine` already drops `expired` (it defaults to `valid=1`), but re-filtering
 * keeps the count honest for any caller that hands over a raw list.
 */
export const countOwnedClouds = (clouds: CloudView[]): number => clouds.filter(c => c.status !== 'expired').length;

/**
 * Whether another cloud may be provisioned right now.
 *
 * Note this is stricter than entitlement. A scheduled cancellation keeps the allowance (the paid
 * period is still running, so the clouds already owned are not excess) but the server refuses to
 * provision a new one: `guardQuota` gates on `isValid`, which is false the moment `canceledAt` is
 * set. Offering the button and letting it 403 would be worse than saying why.
 */
export const evaluateCloudQuota = ({ used, limit, state }: CloudQuotaInput): CloudQuotaVerdict => {
    if (state === 'none' || state === 'expired') return { canAdd: false, reason: 'notEntitled' };
    if (state === 'cancelScheduled') return { canAdd: false, reason: 'cancelScheduled' };
    // Unknown allowance is not zero. Refusing here would stop a paying user for a reason the app
    // invented; let the server be the one to say no.
    if (limit === null) return { canAdd: true };
    if (used >= limit) return { canAdd: false, reason: 'limitReached' };
    return { canAdd: true };
};

/**
 * The clouds sitting past the allowance after a downgrade.
 *
 * Ordered by `cloudNo` (the owner's own sequence, assigned at creation) so the most recently added
 * ones are the ones over the line. This is an app-side guess at what a future server-side cleanup
 * would pick — the banner says so rather than presenting it as settled.
 */
export const findExcessClouds = (clouds: CloudView[], limit: number | null): CloudView[] => {
    if (limit === null) return [];
    const owned = clouds.filter(c => c.status !== 'expired');
    if (owned.length <= limit) return [];
    const ordered = [...owned].sort(
        (a, b) => (a.cloudNo ?? 0) - (b.cloudNo ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
    );
    return ordered.slice(limit);
};
