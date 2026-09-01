import { useMemo } from 'react';

import type { DomainJoin } from '@chatic/data';

import { useRelayInvites, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown, type InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { hasLeftChannel } from '../utils/membership';
import { resolveDmInviteState, type DmInviteState } from '../utils/dmInviteState';

/**
 * How often to re-ask `invite.list` while the 1:1 peer is gone.
 *
 * Matches the waiting screen's cadence, because it is the same wait: the recipient accepts or
 * declines on THEIR device and there is no notification packet for it (백엔드 요청 #4), so the only
 * way to learn is to ask. Paused automatically while the window is in the background.
 */
const PEER_ABSENT_POLL_MS = 30_000;

interface UseDmInviteStateInput {
    channelId?: string | null;
    /** `channel.stereo === 'dm'`. Anything else short-circuits to `present` and asks nothing. */
    isDm: boolean;
    /** The 1:1 peer's user id (`useDmPeer`). */
    peerId?: string | null;
    /** This channel's join rows, from `useChannelJoins` — the screen's single join observer. */
    joins: DomainJoin[];
}

/**
 * What the re-invite form can be opened with. Both fields are best-effort: the server never returns
 * a full phone number (only a masked `last4`), so the only source is this device's own issue log.
 * An empty prefill is a normal outcome — the form then asks for the number (ADR-0068 결정 3).
 */
export interface DmReinvitePrefill {
    name?: string;
    phone?: string;
}

export interface DmInviteStateResult {
    state: DmInviteState;
    /** Live remaining time for the invite the state refers to; `null` when there is none. */
    countdown: InviteCountdown | null;
    /**
     * Reads the prefill for the re-invite form. Deliberately a function, not a value: the answer is
     * only wanted the instant somebody presses the CTA, while this hook lives on a screen that
     * re-renders on every arriving message and scroll tick.
     */
    resolveReinvitePrefill: () => DmReinvitePrefill;
}

/**
 * What the 1:1 room shows below the stream, and whether the composer stays open (ADR-0068).
 *
 * Wires two independent sources into `resolveDmInviteState`: the peer's join row (socket sync, so it
 * is current while the room is open) and the newest invite aimed at this channel (`invite.list`,
 * refetched on focus and polled while the peer is away).
 *
 * The invite read is stood down unless the peer has actually left. That is what keeps this hook
 * free to live on `ChannelRoomPage`, which every channel stereo shares — a group room, a self chat,
 * or a healthy 1:1 costs nothing here.
 */
export const useDmInviteState = ({ channelId, isDm, peerId, joins }: UseDmInviteStateInput): DmInviteStateResult => {
    const peerLeft = useMemo(() => {
        if (!isDm || !peerId) return false;
        return hasLeftChannel(joins.find(join => join.userId === peerId));
    }, [isDm, peerId, joins]);

    // Polling is keyed on `peerLeft` rather than on "an invite is pending", even though only the
    // pending case has news coming. Deriving the flag from the invite would mean feeding this hook's
    // own output back into its input — a render loop — while `peerLeft` comes from the join rows and
    // settles independently. The extra case it covers (peer gone, no invite out) is a room the user
    // is staring at anyway, and it catches an invite issued from another device.
    const { invites } = useRelayInvites(undefined, {
        enabled: peerLeft,
        pollIntervalMs: peerLeft ? PEER_ABSENT_POLL_MS : undefined,
    });
    const { findByInviteId } = useSentInviteLog();

    // Newest first is `invite.list`'s own order, so the first match is the current one — which is why
    // a fresh `pending` outranks the founding `accepted` row that also points here. Locally dismissed
    // rows (ADR-0052 `dismissedAt`) are already handled and must not speak for the room.
    const invite = useMemo(() => {
        if (!peerLeft || !channelId) return undefined;
        return invites.find(row => row.channelId === channelId && !row.dismissedAt);
    }, [peerLeft, channelId, invites]);

    const countdown = useInviteCountdown(invite?.expiredAt);

    const state = useMemo(
        () => resolveDmInviteState({ peerLeft, invite, isExpired: countdown?.isExpired }),
        [peerLeft, invite, countdown?.isExpired]
    );

    // Looked up across EVERY invite that ever pointed at this channel, not just the one `state`
    // refers to. The common case is a room with no live invite at all, where the number is still
    // recoverable from the founding (accepted) invite — the one that created the room.
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
