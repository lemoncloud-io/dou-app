import type { MembershipView } from '@lemoncloud/chatic-backend-api';

type OverrideFields = Pick<MembershipView, 'adminStatus' | 'adminUntil' | 'adminProductId' | 'productId'>;

export const isAdminOverrideActive = (membership: OverrideFields | undefined, now: number): boolean => {
    if (!membership?.adminStatus) {
        return false;
    }

    const until = membership.adminUntil ?? 0;
    return until === 0 || until > now;
};

export const resolveEffectiveProductId = (membership: OverrideFields | undefined, now: number): string | undefined => {
    if (isAdminOverrideActive(membership, now) && membership?.adminProductId) {
        return membership.adminProductId;
    }

    return membership?.productId || undefined;
};
