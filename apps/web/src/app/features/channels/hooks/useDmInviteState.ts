import { useMemo } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import { useRelayInvites, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown, type InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { hasLeftChannel, isDmPeerMissing } from '../utils/membership';
import { resolveDmInviteState, type DmInviteState } from '../utils/dmInviteState';

/**
 * How often to re-ask `invite.list` while the 1:1 peer is gone.
 *
 * Matches the waiting screen's cadence, because it is the same wait: the recipient accepts or
 * declines on THEIR device and there is no notification packet for it (backend request #4), so the only
 * way to learn is to ask. Paused automatically while the window is in the background.
 */
const PEER_ABSENT_POLL_MS = 30_000;

interface UseDmInviteStateInput {
    channelId?: string | null;
    /**
     * Whether this room has an invite flow behind it — `hasDmInviteFlow`, which is a 1:1 AND a relay
     * one. Anything else short-circuits to `present` and asks nothing.
     *
     * This is deliberately not "is a 1:1". A cloud 1:1 is opened by naming a member, so it has no
     * invite to read and no number to send a new one to; asking `invite.list` about it could only
     * ever answer with an unrelated invite or nothing at all.
     */
    hasInviteFlow: boolean;
    /** The 1:1 peer's user id (`useDmPeer`). Absent once the server drops them from the roster. */
    peerId?: string | null;
    /** This channel's join rows, from `useChannelJoins` — the screen's single join observer. */
    joins: DomainJoin[];
    /**
     * The channel itself, for the roster reading. Needed because a departed peer leaves NO join row
     * and no `peerId` — see `isDmPeerMissing`.
     */
    channel?: Pick<DomainChannel, 'stereo' | 'memberIds'> | null;
    /** My user id, to tell my own roster entry from the peer's. */
    userId?: string | null;
}

/**
 * What the re-invite form can be opened with. Both fields are best-effort: the server never returns
 * a full phone number (only a masked `last4`), so the only source is this device's own issue log.
 * An empty prefill is a normal outcome — the form then asks for the number (ADR-0068 decision 3).
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
 * a cloud 1:1, or a healthy relay 1:1 costs nothing here.
 */
export const useDmInviteState = ({
    channelId,
    hasInviteFlow,
    peerId,
    joins,
    channel,
    userId,
}: UseDmInviteStateInput): DmInviteStateResult => {
    /**
     * Two readings, because the server ends a 1:1 membership in two different shapes.
     *
     * `hasLeftChannel` reads a join row that says it ended. `isDmPeerMissing` covers the case where
     * there is no row to read at all — the peer is gone from `channel.memberIds` too, which is what
     * a real departure looked like when measured (2026-09-18). Relying on the join row alone left
     * the room `present` with a live composer, which is the reported bug.
     *
     * Either one is enough. Neither can produce a false positive on a healthy room: a present peer
     * has a live join row AND sits in the roster.
     */
    const peerLeft = useMemo(() => {
        if (!hasInviteFlow) return false;
        if (isDmPeerMissing(channel, userId)) return true;
        if (!peerId) return false;
        return hasLeftChannel(joins.find(join => join.userId === peerId));
    }, [hasInviteFlow, peerId, joins, channel, userId]);

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
