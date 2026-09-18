/**
 * Shared guard for join `nick` values that are not human names.
 *
 * The server seeds a join's `nick` with a value of its own in some flows — the raw user id for an
 * unnamed self-chat (see resolveSelfChatTitle), and an auto-generated account name (`User_0101`)
 * for the recipient of a 1:1 invite. Any title chain that reads `join.nick` first has to reject
 * those, or the header shows an id or a phone fragment where a name belongs.
 */

// Standard UUID (8-4-4-4-12 hex). lemoncloud user ids are UUIDs, and a server-seeded join nick
// defaults to that id — matching this means "not a human name".
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A nick is a raw id — not a display name — when it equals the user's own id or is UUID-shaped. */
export const isRawIdNick = (nick: string, selfUserId?: string | null): boolean =>
    (!!selfUserId && nick === selfUserId) || UUID_PATTERN.test(nick);

// An account with no name of its own gets one made from its phone number's last digits. Both shapes
// the server produces are here: `User_0101` and the masked `***0101`.
const GENERATED_ACCOUNT_NAME_PATTERN = /^(?:user[_-]?\d{2,}|\*{2,}\d{2,})$/i;

/**
 * Whether a nick is a value the SERVER put there rather than a name a person typed.
 *
 * Two kinds, and they arrive through different doors. A raw id is the older one (an unnamed
 * self-chat's join is seeded with the user's id). The second is an auto-generated ACCOUNT name —
 * `User_0101`, built from the last digits of a phone number — and it is the one that reaches a 1:1.
 *
 * **Why the account name has to be caught here.** ADR-0039 kept the peer's account name out of the
 * DM title chain on purpose: it is not a name anyone chose, and "읽히지 않는 이름은 이름이 아니다".
 * But the server seeds the RECIPIENT's `join.nick` with exactly that value, and `join.nick` is the
 * chain's first and most trusted step — so the excluded value walks back in through the one door
 * the chain never questions. Measured 2026-09-18: the inviter's place profile was cached and
 * `channel.name` was empty, and the header still read `User_0101` because step 1 was already taken.
 *
 * The sender's side does not have this problem — their `join.nick` holds the friend name they typed
 * on the invite form, which is a human's choice and must survive.
 *
 * **The trade-off is deliberate.** Somebody who genuinely names a room `User_1234` loses that name.
 * That is accepted: the pattern is narrow (the word `user` plus digits, or a masked number), and
 * the alternative is every invited person seeing a number where a name belongs.
 */
export const isServerSeededNick = (nick: string, selfUserId?: string | null): boolean =>
    isRawIdNick(nick, selfUserId) || GENERATED_ACCOUNT_NAME_PATTERN.test(nick);

/**
 * The join `nick` if it is a name a human chose, otherwise `undefined`.
 *
 * Both title chains (self-chat, DM) open with the same three steps — trim, reject a raw id, fall
 * through — so they share this instead of the guard alone. Sharing only `isRawIdNick` left the two
 * free to drift on trimming or on which argument the guard receives.
 */
export const customJoinNick = (nick: string | null | undefined, selfUserId?: string | null): string | undefined => {
    const trimmed = nick?.trim();
    if (!trimmed || isServerSeededNick(trimmed, selfUserId)) return undefined;
    return trimmed;
};
