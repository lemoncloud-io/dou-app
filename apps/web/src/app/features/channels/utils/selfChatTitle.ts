/**
 * Resolve the display title for a self-chat ("나와의 채팅") channel.
 *
 * The name is stored per-user on the join's `nick` field (see ADR-0022), not on
 * `channel.name`. Precedence: the custom join nick, then my active site-profile
 * nick (NOT the account/user-record name, which can be a raw id/UUID), then a
 * fixed fallback label so the title is never empty.
 */
export const resolveSelfChatTitle = (
    nick: string | null | undefined,
    siteProfileNick: string | null | undefined,
    fallbackLabel: string
): string => {
    const trimmedNick = nick?.trim();
    if (trimmedNick) return trimmedNick;

    const trimmedProfileNick = siteProfileNick?.trim();
    if (trimmedProfileNick) return trimmedProfileNick;

    return fallbackLabel;
};
