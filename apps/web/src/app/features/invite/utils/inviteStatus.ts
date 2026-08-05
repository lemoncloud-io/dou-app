import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

/**
 * List-row status badge for a sent relay invite. `kind` is why the row looks the way it does (the
 * row's second line branches on it); `variant` maps 1:1 to `StatusBadge`'s tone, which declined
 * shares with expired; `labelKey` is the i18n key the row translates for display.
 *
 * `accepted`, `canceled` (and an unrecognized/empty state) resolve to `null`: an accepted invite
 * stops being an "invite row" and shows up as a real channel once it syncs, and a canceled one was
 * retired by the sender — `useInviteListRows` filters both out, so `null` here is defense in depth.
 */
export interface InviteRowBadge {
    kind: 'pending' | 'expired' | 'declined';
    variant: 'pending' | 'expired';
    labelKey: string;
}

/**
 * Row badge for a sent invite. `rejected` is a first-class `MyInviteStatus` since ADR-0043
 * (백엔드 요청 #2) and reads as a distinct "초대 거절" badge.
 */
export const resolveInviteRowBadge = (state: MyInviteStatus | undefined): InviteRowBadge | null => {
    if (state === 'pending') return { kind: 'pending', variant: 'pending', labelKey: 'contactInvite.badge.pending' };
    if (!state || state === 'accepted' || state === 'canceled') return null;
    // Declined keeps the `expired` tone — it is the same "this invite is spent" signal, and the
    // design gives it no separate color; only the label and the row's second line differ.
    if (state === 'rejected') {
        return { kind: 'declined', variant: 'expired', labelKey: 'contactInvite.badge.declined' };
    }
    return { kind: 'expired', variant: 'expired', labelKey: 'contactInvite.badge.expired' };
};

/** Which copy the re-invite dialog (ContactInvitePage) shows when the recipient was already invited. */
export type ReinviteVariant = 'pending' | 'expired' | 'declined';

/**
 * Resolve the re-invite dialog variant from the matched invite's current state (or `undefined`
 * when it fell out of the `invite.list` page window — see the sender doc's "알려진 갭").
 * A `canceled` prior invite lands on `expired` too: either way the old link is dead and the only
 * path forward is a fresh issue.
 */
export const resolveReinviteVariant = (state: MyInviteStatus | undefined): ReinviteVariant => {
    if (state === 'pending') return 'pending';
    if (state === 'rejected') return 'declined';
    return 'expired';
};
