/**
 * `lib/memberships/membershipRow.ts`
 * - Read-only derivations the list and the drawer both render.
 *
 * Whether an override is in force comes from `@chatic/shared` rather than being re-derived here —
 * `apps/web` asks the same question and the two must not answer it differently.
 */
import { isAdminOverrideActive } from '@chatic/shared';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

export type OverrideKind = 'none' | 'grant' | 'block';

export interface OverrideBadge {
    kind: OverrideKind;
    label: string;
}

/** What the override column shows. `until` is rendered as a date, absent means indefinite. */
export const describeOverrideBadge = (membership: MembershipView | undefined, now: number): OverrideBadge => {
    if (!isAdminOverrideActive(membership, now)) {
        return { kind: 'none', label: '없음' };
    }

    const until = membership?.adminUntil;
    const suffix = until ? ` · ~${new Date(until).toLocaleDateString()}` : ' · 무기한';

    if (membership?.adminStatus === 'active') {
        return { kind: 'grant', label: `부여${suffix}` };
    }

    return { kind: 'block', label: `차단(${membership?.adminStatus})${suffix}` };
};

/**
 * Whether the stored `status` disagrees with the live `isValid`.
 *
 * The relay derives `status` once, at write time, and nothing sweeps it afterwards — so a grant
 * that has since lapsed still reads `active` while `isValid`, derived per request, has already
 * turned false. Surfacing the disagreement is the point: it tells the operator the row is a
 * lapsed override rather than a healthy subscription.
 */
export const hasDerivationMismatch = (membership: MembershipView | undefined): boolean => {
    if (typeof membership?.isValid !== 'boolean' || !membership?.status) {
        return false;
    }

    return (membership.status === 'active') !== membership.isValid;
};

/**
 * The membership's grade as the quota will actually be read: the override's while it is in force.
 * The receipt's `productId` stays visible next to it, so the two are never conflated.
 */
export const describeGrade = (membership: MembershipView | undefined, now: number): string => {
    const receipt = membership?.productId || '-';
    const override = membership?.adminProductId;

    if (override && isAdminOverrideActive(membership, now)) {
        return `${override} (영수증: ${receipt})`;
    }

    return receipt;
};
