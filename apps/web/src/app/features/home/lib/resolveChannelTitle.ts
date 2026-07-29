import type { DomainChannel } from '@chatic/data';

import { resolveSelfChatTitle } from '../../channels/utils/selfChatTitle';

export interface ResolveChannelTitleInput {
    channel: DomainChannel;
    /** My user id — drives the owner-vs-member branch (channel.ownerId === uid). */
    uid?: string;
    /** My nick in this channel, from the subscribed join list (freshest after a rename). */
    joinNick?: string;
    /** My active-place profile nick — the self-chat fallback. */
    myNick?: string;
    /** Localized "나와의 채팅" label. */
    selfLabel: string;
    /** Localized fallback for a channel with no name. */
    unnamedLabel: string;
}

/**
 * Display title for a channel row, shared by the home list and the chat-room management list so
 * the two can't drift apart:
 *   - self  → the self-chat title chain (join nick → embedded `$join` nick → profile nick → label)
 *   - owner → the owner-set `channel.name` (my own join nick is ignored)
 *   - member → my per-channel join nick, falling back to `channel.name`
 */
export const resolveChannelTitle = ({
    channel,
    uid,
    joinNick,
    myNick,
    selfLabel,
    unnamedLabel,
}: ResolveChannelTitleInput): string => {
    // Self-chat is identified by stereo (ADR-0022), not member count.
    if (channel.stereo === 'self') {
        return resolveSelfChatTitle(joinNick ?? channel.$join?.nick, myNick, selfLabel, uid);
    }
    const isOwner = !!uid && channel.ownerId === uid;
    const memberNick = joinNick ?? channel.$join?.nick;
    return isOwner ? channel.name?.trim() || unnamedLabel : memberNick?.trim() || channel.name?.trim() || unnamedLabel;
};
