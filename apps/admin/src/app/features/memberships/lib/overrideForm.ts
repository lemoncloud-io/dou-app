/**
 * `lib/memberships/overrideForm.ts`
 * - Turns the override form's state into a request body, a verdict on whether it may be sent, and
 *   the sentences the confirmation dialog shows.
 *
 * Kept out of the component so all three are testable. The `adminStatus`/`adminUntil` checks mirror
 * rules the relay also enforces (subscription-admin SPEC §5.1), so they only refuse what the server
 * would refuse anyway. The mandatory reason is the exception: the relay accepts an empty
 * `adminReason`, and this console is the only thing requiring one — so it is a house rule, not a
 * guarantee. Anything writing to the endpoint directly can still land an override without a why.
 */
import type { MembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

/** What the operator is doing. One axis, three moves — there is no priority rule to reason about. */
export type OverrideMode = 'grant' | 'block' | 'release';

/** The statuses that count as a block. `active` is a grant; anything else the relay refuses. */
export type BlockStatus = 'expired' | 'canceled';

export interface OverrideFormState {
    mode: OverrideMode;
    blockStatus: BlockStatus;
    /** `YYYY-MM-DD` from a date input. Empty means indefinite — there is no "forever" value. */
    until: string;
    /** Empty leaves the grade alone. */
    productId: string;
    reason: string;
    /** Provision clouds up to the raised quota immediately. */
    auto: boolean;
}

export const emptyOverrideForm = (): OverrideFormState => ({
    mode: 'grant',
    blockStatus: 'expired',
    until: '',
    productId: '',
    reason: '',
    auto: false,
});

/**
 * End of the chosen day, local time.
 *
 * A grant "until 2026-12-31" should still be in force during that day, so the instant stored is
 * its last millisecond rather than its midnight. Picking today therefore yields a future time and
 * passes the relay's "no past `adminUntil`" rule instead of being refused.
 */
export const toEpochEndOfDay = (date: string): number | undefined => {
    if (!date) {
        return undefined;
    }

    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) {
        return undefined;
    }

    // `new Date(2026, 12, 40)` silently rolls into the next year rather than failing, so the parts
    // are read back off the result. Unreachable through `<input type="date">`, but this is the one
    // place the expiry instant is built and a rolled-over date would be stored as if chosen.
    const at = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) {
        return undefined;
    }

    return at.getTime();
};

/**
 * `YYYY-MM-DD`, `days` after today in local time — what `<input type="date">` wants.
 *
 * Built off the calendar date rather than `now + days * 86_400_000` so a DST shift moves the
 * wall clock, not the chosen day. `days: 0` is today, which is the earliest the relay accepts
 * (the instant stored is that day's last millisecond).
 */
export const dayOffsetInput = (days: number, now: number): string => {
    const at = new Date(now);
    at.setHours(12, 0, 0, 0);
    at.setDate(at.getDate() + days);

    const month = `${at.getMonth() + 1}`.padStart(2, '0');
    const day = `${at.getDate()}`.padStart(2, '0');

    return `${at.getFullYear()}-${month}-${day}`;
};

const formatDay = (epoch: number): string => new Date(epoch).toLocaleDateString();

/**
 * Reasons the form cannot be submitted, in the order they should be read. Empty means it can.
 */
export const validateOverrideForm = (form: OverrideFormState, now: number): string[] => {
    const errors: string[] = [];

    // The API treats the reason as optional; this console does not (ADR-0101, decision 6). Who changed
    // what and why is the whole audit trail — the relay only keeps the most recent one.
    if (!form.reason.trim()) {
        errors.push('Enter a reason.');
    }

    if (form.mode !== 'release' && form.until) {
        const until = toEpochEndOfDay(form.until);
        if (until === undefined) {
            errors.push('The expiry date is not a valid format.');
        } else if (until <= now) {
            errors.push('The expiry date must be after today.');
        }
    }

    return errors;
};

/** The request body for `PUT /memberships/{userId}/admin`. */
export const buildOverrideBody = (form: OverrideFormState): MembershipBody => {
    const reason = form.reason.trim();

    // Release is a single empty status. The relay clears `adminUntil` and `adminProductId` itself,
    // so sending them would only be a second way to say the same thing.
    if (form.mode === 'release') {
        return { adminStatus: '', adminReason: reason };
    }

    const until = toEpochEndOfDay(form.until);

    return {
        adminStatus: form.mode === 'grant' ? 'active' : form.blockStatus,
        adminReason: reason,
        // Absent means indefinite. Never substitute a far-future date for it.
        ...(until !== undefined ? { adminUntil: until } : {}),
        // A block does not carry a grade — it takes entitlement away, and a tier would be noise.
        ...(form.mode === 'grant' && form.productId ? { adminProductId: form.productId } : {}),
    };
};

/** `auto` only means anything when a grant could raise the quota. */
export const shouldSendAuto = (form: OverrideFormState): boolean => form.mode === 'grant' && form.auto;

export interface OverrideSummary {
    title: string;
    /** What changes, in the order it matters. Rendered as separate lines. */
    lines: string[];
}

/**
 * What the confirmation dialog says. The wording carries the consequences the operator cannot see
 * on this screen: a block suspends clouds while the store keeps charging, and `auto` creates them.
 */
export const describeOverride = (form: OverrideFormState, membership: MembershipView | undefined): OverrideSummary => {
    const userId = membership?.userId || 'This user';

    if (form.mode === 'release') {
        return {
            title: 'Release the admin override',
            lines: [
                `${userId}'s subscription verdict reverts to the receipt immediately.`,
                'The granted term and grade are lifted together.',
                'The record of who did this, when, and why is kept.',
            ],
        };
    }

    if (form.mode === 'block') {
        const until = toEpochEndOfDay(form.until);

        return {
            title: "Block this user's subscription",
            lines: [
                `${userId}'s subscription becomes invalid (${form.blockStatus}).`,
                "This user's Clouds become subject to suspension/reclaim. It is not just a display change.",
                'Store billing keeps charging. The app shows this as a usage restriction, not "expired".',
                until !== undefined
                    ? `The block lifts automatically after ${formatDay(until)}.`
                    : 'Stays in effect until released.',
            ],
        };
    }

    const until = toEpochEndOfDay(form.until);
    const lines = [
        until !== undefined
            ? `Makes ${userId}'s subscription valid through ${formatDay(until)}.`
            : `Makes ${userId}'s subscription valid indefinitely. Stays in effect until released.`,
        'Suspended Clouds are restored.',
    ];

    if (form.productId) {
        lines.push(`The grade changes to ${form.productId}, so the cloud limit follows that product.`);
    }

    lines.push(
        form.auto
            ? 'The limit rises, and Cloud creation requests for the shortfall are queued right away.'
            : 'Only the limit increases; the user creates Clouds themselves.'
    );

    return { title: 'Grant this user a subscription', lines };
};
