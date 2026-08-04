import { customJoinNick } from './nick';

/**
 * Resolve the display title for a 1:1 (DM) channel — the single source every DM surface uses
 * (room header, room settings, home list, chat-room management list). See docs/dm-chat-room.md.
 *
 * A DM has no room name of its own: the room IS the peer. Precedence:
 *   1. my per-channel `join.nick` — the name I chose for this room (invisible to the peer)
 *   2. the peer's place-profile nick — who they say they are in this place
 *   3. `channel.name` — server-set, so a weaker signal than either name above
 *   4. a fixed label, so the title is never empty
 *
 * The peer's user-record name (`user.nick`/`user.name`) is deliberately NOT in the chain. It only
 * hydrates through a per-channel `syncChannelUsers` call, which the list surfaces cannot afford —
 * including it would make the room disagree with the list, which is the exact bug this replaces.
 * It is also frequently a `***1234` phone placeholder (ADR-0033 D10), which reads as noise.
 */
export interface ResolveDmTitleInput {
    /** My nick in this channel (`join.nick`) — the name I gave this room. */
    joinNick?: string | null;
    /** The peer's place-profile nick. Profile only — never their user-record name. */
    peerNick?: string | null;
    /** The server-set channel name. */
    channelName?: string | null;
    /** Localized "no name for this person" label. */
    unnamedLabel: string;
    /** My user id — a join nick equal to it is the server's default, not a name. */
    selfUserId?: string | null;
}

export const resolveDmTitle = ({
    joinNick,
    peerNick,
    channelName,
    unnamedLabel,
    selfUserId,
}: ResolveDmTitleInput): string => {
    // `customJoinNick` trims and rejects a server-seeded raw id — shared with the self-chat title.
    return customJoinNick(joinNick, selfUserId) ?? (peerNick?.trim() || channelName?.trim() || unnamedLabel);
};
