import type { MembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

export type OverrideMode = 'grant' | 'block' | 'release';

export type BlockStatus = 'expired' | 'canceled';

export interface OverrideFormState {
    mode: OverrideMode;
    blockStatus: BlockStatus;
    until: string;
    productId: string;
    reason: string;
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

export const toEpochEndOfDay = (date: string): number | undefined => {
    if (!date) {
        return undefined;
    }

    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) {
        return undefined;
    }

    const at = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) {
        return undefined;
    }

    return at.getTime();
};

export const dayOffsetInput = (days: number, now: number): string => {
    const at = new Date(now);
    at.setHours(12, 0, 0, 0);
    at.setDate(at.getDate() + days);

    const month = `${at.getMonth() + 1}`.padStart(2, '0');
    const day = `${at.getDate()}`.padStart(2, '0');

    return `${at.getFullYear()}-${month}-${day}`;
};

const formatDay = (epoch: number): string => new Date(epoch).toLocaleDateString();

export const validateOverrideForm = (form: OverrideFormState, now: number): string[] => {
    const errors: string[] = [];

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

export const buildOverrideBody = (form: OverrideFormState): MembershipBody => {
    const reason = form.reason.trim();

    if (form.mode === 'release') {
        return { adminStatus: '', adminReason: reason };
    }

    const until = toEpochEndOfDay(form.until);

    return {
        adminStatus: form.mode === 'grant' ? 'active' : form.blockStatus,
        adminReason: reason,
        ...(until !== undefined ? { adminUntil: until } : {}),
        ...(form.mode === 'grant' && form.productId ? { adminProductId: form.productId } : {}),
    };
};

export const shouldSendAuto = (form: OverrideFormState): boolean => form.mode === 'grant' && form.auto;

export interface OverrideSummary {
    title: string;
    lines: string[];
}

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
