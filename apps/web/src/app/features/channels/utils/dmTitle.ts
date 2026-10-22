import { customJoinNick } from './nick';

/**
 * Resolve the display title for a 1:1 (DM) channel — the single source every DM surface uses
 * (room header, room settings, home list, chat-room management list), through
 * `resolveChannelTitle`. See `apps/web/docs/feature/channels/dm-and-self-chat.md`.
 *
 * A DM has no room name of its own: the room IS the peer. Precedence:
 *   1. my per-channel `join.nick` — the name I chose for this room (invisible to the peer)
 *   2. the peer's name — their place-profile nick, and for a cloud 1:1 their cloud-profile name
 *      after it (`resolveDmPeerName` decides, so the room's intro names them the same way)
 *   3. `channel.name` — server-set, so a weaker signal than any name above
 *   4. a fixed label, so the title is never empty
 */
export interface ResolveDmTitleInput {
    /** My nick in this channel (`join.nick`) — the name I gave this room. */
    joinNick?: string | null;
    /** The peer's name, as `resolveDmPeerName` gives it for the room's lineage. */
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
