import { isMentioningViewer } from '@chatic/data';
import type { DomainChat } from '@chatic/data';

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
 * Whether an `@` at `index` starts a word of its own: the start of the text,
 * or preceded by anything but a letter, digit, `_` or `-`. The same left edge
 * `GROUP_MENTION_PATTERN` holds for group words — `lemon@lemoncloud.io` and a
 * password `lemoncloud@123` are never mentions, whatever follows the `@`.
 */
export const isMentionBoundary = (text: string, index: number): boolean =>
    index <= 0 || !/[\p{L}\p{N}_-]/u.test(text[index - 1] ?? '');

/**
 * A name standing anywhere after an `@`, case-insensitively. Names can contain
 * spaces (unlike the composer's token regex), so this errs toward notifying
 * rather than staying silent.
 */
const mentionsNameInText = (text: string, names: Array<string | null | undefined>): boolean => {
    if (!text.includes('@')) return false;
    const lower = text.toLowerCase();
    return names.some(raw => {
        const name = raw?.trim().toLowerCase();
        return !!name && lower.includes(`@${name}`);
    });
};

/**
 * Best-effort "does this message mention me" check, used by the
 * notify='mention' channel mode. Plain case-insensitive substring match on
 * `@<name>` (names can contain spaces, unlike the composer's token regex), so
 * it errs toward notifying rather than staying silent. Group tokens are matched
 * as whole words (`GROUP_MENTION_PATTERN`).
 */
export const isMentioned = (content: string, names: Array<string | null | undefined>): boolean => {
    if (!content.includes('@')) return false;
    if (mentionsNameInText(content, names)) return true;
    return GROUP_MENTION_PATTERN.test(content);
};

/**
 * How a message calls the viewer, when it does: a direct naming or a call to
 * everyone. The single decision point the mention-only filter and the banner
 * title share, so the two cannot disagree about the same message.
 *
 * A mention record wins whenever the message has one — a name in the text may
 * be someone else's. A record naming me reads as direct even beside an `all`
 * flag; a record naming only others reads as nothing, whatever the text says.
 * A message with no record (an older client, a webhook) is read by its text,
 * my name over a group word.
 */
export type MentionKind = 'direct' | 'everyone';

export const mentionKind = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>,
    text: string,
    names: Array<string | null | undefined>
): MentionKind | null => {
    if (chat.mention$) {
        if (isNamedByRecord(chat, viewerIds)) return 'direct';
        // Not named, so the record calls me only through its everyone flag — read by the
        // library, which owns the wire's two spellings of that flag.
        return isMentioningViewer(chat, viewerIds) ? 'everyone' : null;
    }
    if (mentionsNameInText(text, names)) return 'direct';
    if (GROUP_MENTION_PATTERN.test(text)) return 'everyone';
    return null;
};

/**
 * Whether the message's mention record names the viewer directly — by id, not
 * by an everyone flag and never by the text. The quiet-hours breakthrough's
 * only condition: a breakthrough on a text guess would wake the user for
 * someone else of the same name.
 */
export const isNamedByRecord = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>
): boolean => {
    const ids = chat.mention$?.userIds ?? [];
    return viewerIds.some(id => !!id && ids.includes(id));
};

/**
 * Whether a message calls the viewer. One answer with `mentionKind` — the
 * sender's composer record whenever the message has one, else the text.
 * `viewerIds` are the viewer's account id and their member id in the
 * channel's cloud; the record holds member ids.
 */
export const mentionsMe = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>,
    text: string,
    names: Array<string | null | undefined>
): boolean => mentionKind(chat, viewerIds, text, names) !== null;
