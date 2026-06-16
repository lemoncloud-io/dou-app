/** Group tokens that mention everyone in the channel (Slack convention). */
export const GROUP_MENTIONS = ['@channel', '@here', '@everyone'];

/**
 * Character-class source for one mention-token character — \p{L}\p{N} (not \w)
 * so non-ASCII names (한글 etc.) match. Single source for the composer
 * typeahead and the message renderer; build regexes from it with the u flag.
 */
export const MENTION_TOKEN_SOURCE = '[\\p{L}\\p{N}_.-]';

/**
 * Best-effort "does this message mention me" check, used by the
 * notify='mention' channel mode. Plain case-insensitive substring match on
 * `@<name>` (names can contain spaces, unlike the composer's token regex), so
 * it errs toward notifying rather than staying silent.
 */
export const isMentioned = (content: string, names: Array<string | null | undefined>): boolean => {
    if (!content.includes('@')) return false;
    const lower = content.toLowerCase();
    if (GROUP_MENTIONS.some(group => lower.includes(group))) return true;
    return names.some(raw => {
        const name = raw?.trim().toLowerCase();
        return !!name && lower.includes(`@${name}`);
    });
};
