/**
 * Group tokens that mention everyone in the channel: Slack's three, and the words the phone's
 * everyone pick writes — `@all` in English, `@전체` in Korean.
 */
export const GROUP_MENTIONS = ['@channel', '@here', '@everyone', '@all', '@전체'];

/**
 * Character-class source for one mention-token character — \p{L}\p{N} (not \w)
 * so non-ASCII names (Hangul, etc.) match. Single source for the composer
 * typeahead and the message renderer; build regexes from it with the u flag.
 */
export const MENTION_TOKEN_SOURCE = '[\\p{L}\\p{N}_.-]';

/**
 * A group token standing as a word of its own. Unlike a name, `@all` is the start of many ordinary
 * words and addresses (`@Allison`, `bob@allbirds.com`), so a substring match would call everyone
 * on each of them: the token must not follow a letter or digit, nor run on into one. A `.` after it
 * still counts — `@here.` ends a sentence, and this check errs toward notifying.
 */
const GROUP_MENTION_PATTERN = new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])(?:${GROUP_MENTIONS.join('|')})(?![\\p{L}\\p{N}_-])`,
    'iu'
);

/**
 * Best-effort "does this message mention me" check, used by the
 * notify='mention' channel mode. Plain case-insensitive substring match on
 * `@<name>` (names can contain spaces, unlike the composer's token regex), so
 * it errs toward notifying rather than staying silent. Group tokens are matched
 * as whole words (`GROUP_MENTION_PATTERN`).
 */
export const isMentioned = (content: string, names: Array<string | null | undefined>): boolean => {
    if (!content.includes('@')) return false;
    if (GROUP_MENTION_PATTERN.test(content)) return true;
    const lower = content.toLowerCase();
    return names.some(raw => {
        const name = raw?.trim().toLowerCase();
        return !!name && lower.includes(`@${name}`);
    });
};
