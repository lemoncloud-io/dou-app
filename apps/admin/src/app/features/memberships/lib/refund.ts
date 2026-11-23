import { relayStageOf, type RelayStage } from './targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

export const WEB_SUBSCRIPTION_PLATFORM = 'portone';

export const isWebSubscription = (membership: Pick<MembershipView, 'platform'>): boolean =>
    (membership.platform as string | undefined) === WEB_SUBSCRIPTION_PLATFORM;

export const refundEndpointFor = (endpoint: string | undefined, stage: RelayStage): string =>
    relayStageOf(endpoint) === stage ? (endpoint ?? '').trim().replace(/\/+$/, '') : '';

export interface RefundAvailability {
    enabled: boolean;
    reason?: string;
}

export const refundAvailability = (
    membership: Pick<MembershipView, 'userId' | 'status'>,
    endpoint: string | undefined
): RefundAvailability => {
    if (!endpoint?.trim()) {
        return {
            enabled: false,
            reason: "No relay to refund on — the stage's relay endpoint must be set and end in /dou-d1.",
        };
    }
    if (relayStageOf(endpoint) !== 'd1') {
        return { enabled: false, reason: 'Production refunds are not open yet — switch the stage to Development.' };
    }
    if (!membership.userId) {
        return { enabled: false, reason: 'This record has no userId to refund.' };
    }

    const status = membership.status as string | undefined;
    if (status === 'pending') {
        return { enabled: false, reason: 'The first charge is still being confirmed — nothing has been paid yet.' };
    }
    if (status === 'expired') {
        return { enabled: false, reason: 'Already expired — there is no running subscription to refund.' };
    }

    return { enabled: true };
};

export const isRefundReasonValid = (reason: string): boolean => reason.trim().length > 0;

export const describeRefundFailure = (error: unknown): string => {
    const raw = readServerMessage(error);
    const status = readStatus(error) ?? Number(raw.match(/^(\d{3})\b/)?.[1] ?? NaN);

    if (status === 409) {
        return `No paid charge to refund — a trial, a first charge still being confirmed, or already refunded. (${raw})`;
    }
    if (status === 404) {
        return `This user has no web subscription. (${raw})`;
    }
    if (status === 403) {
        return `Not allowed — this account is not an admin on the target server. (${raw})`;
    }
    return raw;
};

interface HttpLikeError {
    message?: string;
    status?: number;
    response?: { status?: number; data?: unknown };
}

const readStatus = (error: unknown): number | undefined => {
    const e = error as HttpLikeError | undefined;
    return e?.response?.status ?? e?.status;
};

const readServerMessage = (error: unknown): string => {
    const e = error as HttpLikeError | undefined;
    const data = e?.response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
        const text = (data as { message?: unknown; error?: unknown }).message ?? (data as { error?: unknown }).error;
        if (typeof text === 'string' && text.trim()) return text.trim();
    }
    return e?.message || 'The request failed.';
};
