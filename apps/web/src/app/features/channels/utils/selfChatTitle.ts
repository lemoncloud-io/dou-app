/**
 * Resolve the display title for a self-chat ("나와의 채팅") channel.
 *
 * The name is stored per-user on the join's `nick` field (see ADR-0022), not on
 * `channel.name`. Precedence: the custom join nick, then my active site-profile
 * nick (NOT the account/user-record name, which can be a raw id/UUID), then a
 * fixed fallback label so the title is never empty.
 *
 * IMPORTANT: an unnamed self-chat is server-seeded with `nick = userId` (a raw
 * UUID), so the join nick is only accepted when it is an actual custom name — a
 * raw id (equal to the user's own id, or UUID-shaped) is ignored so the title
 * falls through to the human site-profile nick instead of leaking the UUID.
 */

// Standard UUID (8-4-4-4-12 hex). lemoncloud user ids are UUIDs, and an unnamed self-chat's
// join nick defaults to that id — matching this means "not a human name".
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A nick is a raw id — not a display name — when it equals the user's own id or is UUID-shaped. */
const isRawIdNick = (nick: string, selfUserId?: string | null): boolean =>
    (!!selfUserId && nick === selfUserId) || UUID_PATTERN.test(nick);

export const resolveSelfChatTitle = (
    nick: string | null | undefined,
    siteProfileNick: string | null | undefined,
    fallbackLabel: string,
    /** The user id that owns this join; a nick equal to it is the server's default, not a name. */
    selfUserId?: string | null
): string => {
    const trimmedNick = nick?.trim();
    // Accept the join nick only when it is a real custom name. The server seeds an unnamed
    // self-chat with nick = userId (a UUID), which must fall through to the profile nick.
    if (trimmedNick && !isRawIdNick(trimmedNick, selfUserId)) return trimmedNick;

    const trimmedProfileNick = siteProfileNick?.trim();
    if (trimmedProfileNick) return trimmedProfileNick;

    return fallbackLabel;
};
