import type { DomainChannel } from '@chatic/data';

import { resolveDmTitle } from '../utils/dmTitle';
import { resolveSelfChatTitle } from '../utils/selfChatTitle';
import { dmLineageOf } from './channelStereoPolicy';

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
    /** Localized "self-chat" label. */
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
 *   - dm    → the DM chain (my join nick → peer profile nick → channel.name → label; ADR-0039),
 *             with step 1 dropped for a cloud 1:1 — see the note at that branch
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
    // Self-chat is identified by stereo (ADR-0026), not member count.
    if (channel.stereo === 'self') {
        return resolveSelfChatTitle(joinNick ?? channel.$join?.nick, myNick, selfLabel, uid);
    }
    if (channel.stereo === 'dm') {
        /**
         * **A cloud 1:1 skips step 1 entirely.**
         *
         * That step means "the name I chose for this room", and the server does not honour it: it
         * seeds `join.nick` on rooms nobody has named. `customJoinNick` catches the seeded values
         * that LOOK machine-made — a raw id, `User_0101`, a masked number — and it cannot catch one
         * that looks like a person, because nothing in the string says who wrote it. Measured on
         * dev: a freshly opened cloud 1:1 came back with a plausible human name in `join.nick`, so
         * the header read that while the picker, the system message and every other surface read
         * the place profile. Same person, two names, one of which nobody chose.
         *
         * Skipping is safe here in a way it would not be on relay. A relay 1:1 begins at an invite
         * form where the sender TYPES the friend's name, and that name lands in their `join.nick` —
         * a real choice that has to survive. A cloud 1:1 has no such step: nothing has been typed,
         * so there is nothing to lose, and the profile is the answer the whole flow is built on.
         *
         * This is a stopgap over a server behaviour, not a rule about naming. The fix is for the
         * server to stop seeding the field, or to say whether a value was user-set; until then the
         * client cannot tell, and guessing from the string is what failed.
         */
        const trustJoinNick = dmLineageOf(channel) !== 'cloud';
        return resolveDmTitle({
            joinNick: trustJoinNick ? (joinNick ?? channel.$join?.nick) : undefined,
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
