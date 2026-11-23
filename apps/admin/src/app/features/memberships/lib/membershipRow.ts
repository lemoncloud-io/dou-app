import { isAdminOverrideActive } from '@chatic/shared';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

export type OverrideKind = 'none' | 'grant' | 'block';

export interface OverrideBadge {
    kind: OverrideKind;
    label: string;
}

export const describeOverrideBadge = (membership: MembershipView | undefined, now: number): OverrideBadge => {
    if (!isAdminOverrideActive(membership, now)) {
        return { kind: 'none', label: 'None' };
    }

    const until = membership?.adminUntil;
    const suffix = until ? ` · ~${new Date(until).toLocaleDateString()}` : ' · Indefinite';

    if (membership?.adminStatus === 'active') {
        return { kind: 'grant', label: `Grant${suffix}` };
    }

    return { kind: 'block', label: `Block(${membership?.adminStatus})${suffix}` };
};

export const hasDerivationMismatch = (membership: MembershipView | undefined): boolean => {
    if (typeof membership?.isValid !== 'boolean' || !membership?.status) {
        return false;
    }

    return (membership.status === 'active') !== membership.isValid;
};

export const describeGrade = (membership: MembershipView | undefined, now: number): string => {
    const receipt = membership?.productId || '-';
    const override = membership?.adminProductId;

    if (override && isAdminOverrideActive(membership, now)) {
        return `${override} (receipt: ${receipt})`;
    }

    return receipt;
};
