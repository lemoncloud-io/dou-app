import type { ChatSubType, DomainChat } from '@chatic/data';

/**
 * What a system row should print. Either a localized sentence built from the
 * event's `subType`, or — for rows that predate `subType` — whatever natural-language
 * text the server already put in `content`.
 */
export type SystemMessageText = { kind: 'i18n'; key: string; name: string } | { kind: 'raw'; text: string };

// Keyed by the contract union rather than bare string, so a subtype added to the
// package shows up here as a missing entry rather than silently taking the fallback.
const SUFFIX_KEYS: Partial<Record<ChatSubType, string>> = {
    join: 'chat.system.join',
    leave: 'chat.system.leave',
};

/**
 * Turns a system chat into printable text, or `null` when there is nothing worth
 * printing. The only place that maps a `subType` to a string.
 *
 * Unknown subtypes deliberately do not fall through to the key itself or to an empty
 * line — a value this build has never heard of (the contract package gains new ones
 * ahead of us) must not leak the raw key into the transcript. It falls back to
 * `content` when the server wrote something readable there, which is also how the
 * pre-`subType` rows still render, and to `null` otherwise.
 *
 * `apps/web` solves the same problem with a suffix key and a separately-rendered bold
 * name (`systemMessageSuffixKey`). Desktop keeps the whole sentence in the key instead:
 * the notice line is one muted run of text with no bold prefix, so splitting it would
 * only make the two halves harder to translate.
 *
 * An unresolved author takes the same fallback as an unknown subtype. The name is the
 * subject of the sentence, and "joined the channel" with the subject missing reads as
 * a bug; the server's own `content` says who it was.
 */
export const systemMessageText = (chat: DomainChat, authorName: string): SystemMessageText | null => {
    const key = chat.subType ? SUFFIX_KEYS[chat.subType] : undefined;
    const name = authorName.trim();
    if (key && name) return { kind: 'i18n', key, name };
    const text = chat.content?.trim();
    return text ? { kind: 'raw', text } : null;
};
