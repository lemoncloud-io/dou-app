import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

export interface DmInviteSource {
    state?: MyInviteStatus;
    expiredAt?: number;
}

export interface ResolveDmInviteStateInput {
    peerLeft: boolean;
    invite?: DmInviteSource | null;
    isExpired?: boolean;
}

export type DmInviteState =
    | { kind: 'present' }
    | { kind: 'absent' }
    | { kind: 'pending'; expiredAt?: number }
    | { kind: 'rejected' }
    | { kind: 'expired'; expiredAt?: number };

export const resolveDmInviteState = ({ peerLeft, invite, isExpired }: ResolveDmInviteStateInput): DmInviteState => {
    if (!peerLeft) return { kind: 'present' };
    if (!invite) return { kind: 'absent' };

    switch (invite.state) {
        case 'pending':
            return isExpired
                ? { kind: 'expired', expiredAt: invite.expiredAt }
                : { kind: 'pending', expiredAt: invite.expiredAt };
        case 'rejected':
            return { kind: 'rejected' };
        case 'expired':
            return { kind: 'expired', expiredAt: invite.expiredAt };
        case 'accepted':
        case 'canceled':
        default:
            return { kind: 'absent' };
    }
};

export const canReinviteDm = (state: DmInviteState): boolean => state.kind !== 'present' && state.kind !== 'pending';
