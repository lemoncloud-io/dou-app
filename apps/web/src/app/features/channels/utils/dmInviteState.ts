import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

/**
 * The invite fields this derivation reads. Structural rather than `MyInviteView` so the rule stays
 * testable without the server view — and so it is obvious that nothing else about an invite
 * influences what the room says.
 */
export interface DmInviteSource {
    state?: MyInviteStatus;
    /** Expiry instant (epoch ms) the countdown runs against. */
    expiredAt?: number;
}

export interface ResolveDmInviteStateInput {
    /** Whether the 1:1 peer has left the room — `hasLeftChannel` on their join row. */
    peerLeft: boolean;
    /**
     * The newest invite pointing at THIS channel, with locally dismissed rows already filtered out
     * (see `useDmInviteState`). `invite.list` answers newest-first, so callers take the first match.
     */
    invite?: DmInviteSource | null;
    /** Whether the countdown has run out — the client's own reading of `expiredAt`. */
    isExpired?: boolean;
}

/**
 * What the room says about a 1:1 whose peer may be gone.
 *
 * `present` is the ordinary room: no footer, composer live. Every other value means the peer is not
 * here, which is also the composer-lock condition — one flag, so the footer and the input can never
 * disagree about whether there is somebody to talk to.
 */
export type DmInviteState =
    | { kind: 'present' }
    | { kind: 'absent' }
    | { kind: 'pending'; expiredAt?: number }
    | { kind: 'rejected' }
    | { kind: 'expired'; expiredAt?: number };

/**
 * Resolve what the 1:1 room shows below the stream (ADR-0068 결정 1).
 *
 * Two inputs, deliberately from different sources: presence comes from the join rows (socket sync)
 * and the invite state from `invite.list` (focus refetch / polling). Neither waits on the other, so
 * the room is never blocked on the half it does not have.
 */
export const resolveDmInviteState = ({ peerLeft, invite, isExpired }: ResolveDmInviteStateInput): DmInviteState => {
    if (!peerLeft) return { kind: 'present' };
    if (!invite) return { kind: 'absent' };

    switch (invite.state) {
        case 'pending':
            // The server keeps answering `pending` until somebody re-asks, so the moment the link
            // dies is the client's call — the countdown reaching zero, not a refetch.
            return isExpired
                ? { kind: 'expired', expiredAt: invite.expiredAt }
                : { kind: 'pending', expiredAt: invite.expiredAt };
        case 'rejected':
            return { kind: 'rejected' };
        case 'expired':
            return { kind: 'expired', expiredAt: invite.expiredAt };
        // `accepted` lands here for the room's OWN founding invite: every DM exists because somebody
        // accepted one, and that row keeps pointing at this channel forever. Reading it as "an invite
        // is in flight" would hide the re-invite CTA for good once the peer left, so a spent invite
        // is no invite. `canceled` is the same — the sender already retired it.
        case 'accepted':
        case 'canceled':
        default:
            return { kind: 'absent' };
    }
};

/**
 * Whether the footer offers "다시 초대하기".
 *
 * Withheld while an invite is live: a second code for the same person would leave two working links
 * out there, which is the rule the sender flow already keeps (ADR-0043 결정 5 retires before it
 * reissues). Figma agrees — the pending frame (4062-14154) has no button.
 */
export const canReinviteDm = (state: DmInviteState): boolean => state.kind !== 'present' && state.kind !== 'pending';
