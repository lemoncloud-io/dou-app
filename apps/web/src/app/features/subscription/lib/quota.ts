import type { CloudView } from '@lemoncloud/chatic-backend-api';

import type { SubscriptionState } from './membershipStatus';

export type CloudQuotaReason = 'notEntitled' | 'canceled' | 'limitReached';

export interface CloudQuotaVerdict {
    canAdd: boolean;
    reason?: CloudQuotaReason;
}

export interface CloudQuotaInput {
    used: number;
    limit: number | null;
    state: SubscriptionState;
    isValid?: boolean;
}

export const countOwnedClouds = (clouds: CloudView[]): number => clouds.filter(c => c.status !== 'expired').length;

export const evaluateCloudQuota = ({ used, limit, state, isValid }: CloudQuotaInput): CloudQuotaVerdict => {
    if (state === 'none' || state === 'expired' || state === 'blocked') {
        return { canAdd: false, reason: 'notEntitled' };
    }
    if (isValid === false) return { canAdd: false, reason: 'canceled' };
    if (limit === null) return { canAdd: true };
    if (used >= limit) return { canAdd: false, reason: 'limitReached' };
    return { canAdd: true };
};
