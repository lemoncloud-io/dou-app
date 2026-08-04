/**
 * Shared guard for join `nick` values that are not human names.
 *
 * The server seeds a join's `nick` with the raw user id in some flows (an unnamed self-chat is the
 * known case — see resolveSelfChatTitle), so any title chain that reads `join.nick` first has to
 * reject that value or it leaks a UUID into the header.
 */

// Standard UUID (8-4-4-4-12 hex). lemoncloud user ids are UUIDs, and a server-seeded join nick
// defaults to that id — matching this means "not a human name".
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A nick is a raw id — not a display name — when it equals the user's own id or is UUID-shaped. */
export const isRawIdNick = (nick: string, selfUserId?: string | null): boolean =>
    (!!selfUserId && nick === selfUserId) || UUID_PATTERN.test(nick);

/**
 * The join `nick` if it is a name a human chose, otherwise `undefined`.
 *
 * Both title chains (self-chat, DM) open with the same three steps — trim, reject a raw id, fall
 * through — so they share this instead of the guard alone. Sharing only `isRawIdNick` left the two
 * free to drift on trimming or on which argument the guard receives.
 */
export const customJoinNick = (nick: string | null | undefined, selfUserId?: string | null): string | undefined => {
    const trimmed = nick?.trim();
    if (!trimmed || isRawIdNick(trimmed, selfUserId)) return undefined;
    return trimmed;
};
