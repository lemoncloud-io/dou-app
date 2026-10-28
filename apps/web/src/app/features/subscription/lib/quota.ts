import type { CloudView } from '@lemoncloud/chatic-backend-api';

import type { SubscriptionState } from './membershipStatus';

/** Why "＋ 클라우드 추가" refuses. The button stays visible either way — we tell, not hide. */
export type CloudQuotaReason = 'notEntitled' | 'canceled' | 'limitReached';

export interface CloudQuotaVerdict {
    canAdd: boolean;
    reason?: CloudQuotaReason;
}

export interface CloudQuotaInput {
    used: number;
    /** `null` = the app could not resolve the allowance (see `resolveMaxClouds`). */
    limit: number | null;
    state: SubscriptionState;
    /** The membership response's `isValid` — `undefined` while it has not been read. */
    isValid?: boolean;
}

/**
 * `GET /clouds/0/list?view=mine` already drops `expired` (it defaults to `valid=1`), but re-filtering
 * keeps the count honest for any caller that hands over a raw list.
 */
export const countOwnedClouds = (clouds: CloudView[]): number => clouds.filter(c => c.status !== 'expired').length;

/**
 * Whether another cloud may be provisioned right now.
 *
 * Past the five states this asks the server's own question. `guardQuota` refuses to provision for a
 * membership whose `isValid` is false, and the membership response carries that same judgement, so
 * the app reads it rather than re-deriving it from the receipt fields. It is false when the purchase
 * was cancelled outright — a refund, a revocation, a cancellation the store made — and true for
 * someone who only turned auto-renew off: that subscription is still paid for and still a
 * subscription, so it may add clouds up to its allowance. Offering the button and letting it 403
 * would be worse than saying why.
 */
export const evaluateCloudQuota = ({ used, limit, state, isValid }: CloudQuotaInput): CloudQuotaVerdict => {
    // `blocked` sits here with the other non-entitled states rather than falling through to the
    // permissive tail: an admin block turns `isValid` false server-side, so `guardQuota` would
    // refuse anyway and the button would only 403.
    if (state === 'none' || state === 'expired' || state === 'blocked') {
        return { canAdd: false, reason: 'notEntitled' };
    }
    // Only a definite `false` refuses: an unread flag is not a reason to stop a paying user.
    if (isValid === false) return { canAdd: false, reason: 'canceled' };
    // Unknown allowance is not zero. Refusing here would stop a paying user for a reason the app
    // invented; let the server be the one to say no.
    if (limit === null) return { canAdd: true };
    if (used >= limit) return { canAdd: false, reason: 'limitReached' };
    return { canAdd: true };
};
