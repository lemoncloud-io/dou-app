import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

export interface InviteRowBadge {
    kind: 'pending' | 'expired' | 'declined';
    variant: 'pending' | 'expired';
    labelKey: string;
}

export const resolveInviteRowBadge = (state: MyInviteStatus | undefined): InviteRowBadge | null => {
    if (state === 'pending') return { kind: 'pending', variant: 'pending', labelKey: 'contactInvite.badge.pending' };
    if (!state || state === 'accepted' || state === 'canceled') return null;
    if (state === 'rejected') {
        return { kind: 'declined', variant: 'expired', labelKey: 'contactInvite.badge.declined' };
    }
    return { kind: 'expired', variant: 'expired', labelKey: 'contactInvite.badge.expired' };
};

export type ReinviteVariant = 'pending' | 'expired' | 'declined';

export const resolveReinviteVariant = (state: MyInviteStatus | undefined): ReinviteVariant => {
    if (state === 'pending') return 'pending';
    if (state === 'rejected') return 'declined';
    return 'expired';
};
