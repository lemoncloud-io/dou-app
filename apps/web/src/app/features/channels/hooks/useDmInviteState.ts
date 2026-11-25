import { useMemo } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/runtime-react';

import { useRelayInvites, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown, type InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { hasLeftChannel, isDmPeerMissing } from '../utils/membership';
import { resolveDmInviteState, type DmInviteState } from '../utils/dmInviteState';

const PEER_ABSENT_POLL_MS = 30_000;

interface UseDmInviteStateInput {
    channelId?: string | null;
    hasInviteFlow: boolean;
    peerId?: string | null;
    joins: DomainJoin[];
    channel?: Pick<DomainChannel, 'stereo' | 'memberIds'> | null;
    userId?: string | null;
}

export interface DmReinvitePrefill {
    name?: string;
    phone?: string;
}

export interface DmInviteStateResult {
    state: DmInviteState;
    countdown: InviteCountdown | null;
    resolveReinvitePrefill: () => DmReinvitePrefill;
}

export const useDmInviteState = ({
    channelId,
    hasInviteFlow,
    peerId,
    joins,
    channel,
    userId,
}: UseDmInviteStateInput): DmInviteStateResult => {
    const peerLeft = useMemo(() => {
        if (!hasInviteFlow) return false;
        if (isDmPeerMissing(channel, userId)) return true;
        if (!peerId) return false;
        return hasLeftChannel(joins.find(join => join.userId === peerId));
    }, [hasInviteFlow, peerId, joins, channel, userId]);

    const { invites } = useRelayInvites(undefined, {
        enabled: peerLeft,
        pollIntervalMs: peerLeft ? PEER_ABSENT_POLL_MS : undefined,
    });
    const { findByInviteId } = useSentInviteLog();

    const invite = useMemo(() => {
        if (!peerLeft || !channelId) return undefined;
        return invites.find(row => row.channelId === channelId && !row.dismissedAt);
    }, [peerLeft, channelId, invites]);

    const countdown = useInviteCountdown(invite?.expiredAt);

    const state = useMemo(
        () => resolveDmInviteState({ peerLeft, invite, isExpired: countdown?.isExpired }),
        [peerLeft, invite, countdown?.isExpired]
    );

    const resolveReinvitePrefill = (): DmReinvitePrefill => {
        if (!channelId) return {};
        for (const row of invites) {
            if (row.channelId !== channelId || !row.id) continue;
            const logged = findByInviteId(row.id);
            if (logged) return { name: logged.name, phone: logged.phone };
        }
        return {};
    };

    return { state, countdown, resolveReinvitePrefill };
};
