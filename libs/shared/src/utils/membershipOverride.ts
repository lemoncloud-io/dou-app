import type { MembershipView } from '@lemoncloud/chatic-backend-api';

/**
 * The admin override axis, as the relay stores it. Narrowed to what the derivation reads so a
 * console row and a full `MembershipView` can both be passed.
 */
type OverrideFields = Pick<MembershipView, 'adminStatus' | 'adminUntil' | 'adminProductId' | 'productId'>;

/**
 * Whether the admin override is in force right now — `adminStatus` set, and either no `adminUntil`
 * or one still in the future (subscription-admin SPEC §3.3).
 *
 * **Read the raw fields, not the derived `status`.** The relay derives `status` once, at write
 * time, and nothing sweeps it afterwards, so a lapsed override leaves `status: 'active'` behind.
 * Comparing `adminUntil` against the caller's clock is right the moment it passes.
 *
 * `now` is required rather than defaulted. The server spec flags the same trap: treat a missing
 * comparison time as `0` and every expired override reads as active.
 *
 * An empty `adminStatus` is the release encoding, and reads here as "no override" — which is what
 * it means.
 */
export const isAdminOverrideActive = (membership: OverrideFields | undefined, now: number): boolean => {
    if (!membership?.adminStatus) {
        return false;
    }

    // Absent and `0` both mean indefinite. The wire has no special "forever" value.
    const until = membership.adminUntil ?? 0;
    return until === 0 || until > now;
};

/**
 * The product a quota should be read from: the override's grade while the override is in force,
 * otherwise the receipt's. Mirrors the relay's `asEffectiveProductId`.
 */
export const resolveEffectiveProductId = (membership: OverrideFields | undefined, now: number): string | undefined => {
    if (isAdminOverrideActive(membership, now) && membership?.adminProductId) {
        return membership.adminProductId;
    }

    return membership?.productId || undefined;
};
