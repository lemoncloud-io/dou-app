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
    // `blocked` sits here with the other non-entitled states rather than falling through to the
    // permissive tail: an admin block turns `isValid` false server-side, so `guardQuota` would
    // refuse anyway and the button would only 403.
    if (state === 'none' || state === 'expired' || state === 'blocked') {
        return { canAdd: false, reason: 'notEntitled' };
    }
    if (state === 'cancelScheduled') return { canAdd: false, reason: 'cancelScheduled' };
    // Unknown allowance is not zero. Refusing here would stop a paying user for a reason the app
    // invented; let the server be the one to say no.
    if (limit === null) return { canAdd: true };
    if (used >= limit) return { canAdd: false, reason: 'limitReached' };
    return { canAdd: true };
};
