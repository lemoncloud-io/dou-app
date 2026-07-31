import type { DomainChannel } from '@chatic/data';

import { resolveDmTitle } from '../../channels/utils/dmTitle';
import { resolveSelfChatTitle } from '../../channels/utils/selfChatTitle';

export interface ResolveChannelTitleInput {
    channel: DomainChannel;
    /** My user id — drives the owner-vs-member branch (channel.ownerId === uid). */
    uid?: string;
    /** My nick in this channel, from the subscribed join list (freshest after a rename). */
    joinNick?: string;
    /** My active-place profile nick — the self-chat fallback. */
    myNick?: string;
    /** The DM peer's place-profile nick (from `useDmPeers`) — ignored for non-DM channels. */
    peerNick?: string;
    /** Localized "나와의 채팅" label. */
    selfLabel: string;
    /** Localized fallback for a channel with no name. */
    unnamedLabel: string;
    /** Localized fallback for a DM whose peer we have no name for. */
    dmUnnamedLabel: string;
}

/**
 * Display title for a channel row, shared by the home list and the chat-room management list so
 * the two can't drift apart:
 *   - self  → the self-chat title chain (join nick → embedded `$join` nick → profile nick → label)
 *   - dm    → the DM chain (my join nick → peer profile nick → channel.name → label; ADR-0039)
 *   - owner → the owner-set `channel.name` (my own join nick is ignored)
 *   - member → my per-channel join nick, falling back to `channel.name`
 *
 * The DM branch returns before the owner/member split reaches it. That split is wrong for a DM: the
 * inviter owns the channel, so it would show the server-set `channel.name` and ignore both my own
 * name for the room and the peer's profile — which is exactly how the home list came to disagree
 * with the room header.
 */
export const resolveChannelTitle = ({
    channel,
    uid,
    joinNick,
    myNick,
    peerNick,
    selfLabel,
    unnamedLabel,
    dmUnnamedLabel,
}: ResolveChannelTitleInput): string => {
    // Self-chat is identified by stereo (ADR-0022), not member count.
    if (channel.stereo === 'self') {
        return resolveSelfChatTitle(joinNick ?? channel.$join?.nick, myNick, selfLabel, uid);
    }
    if (channel.stereo === 'dm') {
        return resolveDmTitle({
            joinNick: joinNick ?? channel.$join?.nick,
            peerNick,
            channelName: channel.name,
            unnamedLabel: dmUnnamedLabel,
            selfUserId: uid,
        });
    }
    const isOwner = !!uid && channel.ownerId === uid;
    const memberNick = joinNick ?? channel.$join?.nick;
    return isOwner ? channel.name?.trim() || unnamedLabel : memberNick?.trim() || channel.name?.trim() || unnamedLabel;
};
