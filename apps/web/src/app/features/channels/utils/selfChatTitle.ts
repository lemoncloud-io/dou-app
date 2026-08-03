import { customJoinNick } from './nick';

/**
 * Resolve the display title for a self-chat ("나와의 채팅") channel.
 *
 * The name is stored per-user on the join's `nick` field (see ADR-0026), not on
 * `channel.name`. Precedence: the custom join nick, then my active site-profile
 * nick (NOT the account/user-record name, which can be a raw id/UUID), then a
 * fixed fallback label so the title is never empty.
 *
 * IMPORTANT: an unnamed self-chat is server-seeded with `nick = userId` (a raw
 * UUID), so the join nick is only accepted when it is an actual custom name — a
 * raw id (equal to the user's own id, or UUID-shaped) is ignored so the title
 * falls through to the human site-profile nick instead of leaking the UUID.
 */
export const resolveSelfChatTitle = (
    nick: string | null | undefined,
    siteProfileNick: string | null | undefined,
    fallbackLabel: string,
    /** The user id that owns this join; a nick equal to it is the server's default, not a name. */
    selfUserId?: string | null
): string => {
    // Accept the join nick only when it is a real custom name. The server seeds an unnamed
    // self-chat with nick = userId (a UUID), which must fall through to the profile nick.
    return customJoinNick(nick, selfUserId) ?? (siteProfileNick?.trim() || fallbackLabel);
};
