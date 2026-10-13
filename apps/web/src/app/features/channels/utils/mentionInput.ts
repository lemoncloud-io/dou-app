import type { ChatMentionBody } from '@chatic/data';

/**
 * Mentions in the composer's plain textarea.
 *
 * The field is a `<textarea>`, so a mention cannot be an atomic node the way it is in a rich editor.
 * The text keeps a plain `@name`, and who that name means is remembered beside it as a pick. At send
 * the picks whose `@name` is still in the text become the message's mention; one the user deleted, or
 * an `@name` typed by hand, mentions nobody. The server never reads the text to decide who was called.
 */

/** What the "everyone" pick writes after `@`. Readers and the desktop composer treat it as everyone. */
export const EVERYONE_MENTION = 'channel';

/** Every word readers treat as calling everyone, so typing one of them finds the everyone row. */
export const EVERYONE_ALIASES: readonly string[] = [EVERYONE_MENTION, 'here', 'everyone'];

/**
 * What may follow a name and still leave it the same name.
 *
 * A Latin letter, a digit, `_` or `-` runs the name on (`@Min` is not `@Min-jun` or `@Minsu`), and so
 * does nothing else: a Korean particle or honorific written straight after the name (`@민수님`,
 * `@민수가`) is how a name is often written, and punctuation ends a sentence (`@Min.`). Where a Hangul
 * name is the start of another one (`민` / `민수`), the longest name the text holds wins instead.
 */
const NAME_RUNS_ON = /^[A-Za-z0-9_-]/u;

/** Escapes a name for use inside a regular expression. */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A name picked from the suggestion list, and the label it wrote into the text after `@`. */
export interface MentionPick {
    label: string;
    /** The member's id in this room — the id space the room's member list uses. Absent for everyone. */
    userId?: string;
    everyone?: boolean;
}

/** One row the suggestion list can offer. */
export interface MentionCandidate {
    /** Member id in this room, or a fixed key for the everyone row. */
    id: string;
    /** The name written after `@` when this row is picked, and shown on the row. */
    label: string;
    thumbnail?: string;
    everyone?: boolean;
    /** Extra words the row answers to while filtering — the localized "everyone" title, for one. */
    keywords?: readonly string[];
}

/** An `@` being typed: where it sits in the text and what has been typed after it, up to the caret. */
export interface MentionQuery {
    start: number;
    query: string;
}

/** Past this many characters after `@` it is not a name being looked up any more. */
const QUERY_MAX = 30;

/**
 * The `@` the caret is in, if any.
 *
 * Only an `@` at the start of the text or after whitespace opens a lookup, so an e-mail address
 * (`ops@here.io`) does not. The lookup ends at whitespace: a name with a space in it is found by its
 * first word, and typing the space closes the list.
 */
export const findMentionQuery = (text: string, caret: number): MentionQuery | null => {
    const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
    const match = /(?:^|\s)@([^\s@]*)$/u.exec(before);
    if (!match) return null;
    const query = match[1];
    if (query.length > QUERY_MAX) return null;
    return { start: before.length - query.length - 1, query };
};

/**
 * Replaces the `@word` the caret is in with `@label ` and says where the caret goes next.
 *
 * The whole word is replaced, not only what lies before the caret: picking with the caret inside
 * `@Mi|nsu` must not leave `nsu` behind. The trailing space ends the name, so the next word typed is
 * not read as part of it; when the text already has whitespace right after the word, that one is used
 * instead of adding a second.
 */
export const applyMentionPick = (
    text: string,
    at: MentionQuery,
    caret: number,
    label: string
): { text: string; caret: number } => {
    const from = Math.max(caret, at.start);
    const wordEnd = from + (/^[^\s@]*/u.exec(text.slice(from))?.[0].length ?? 0);
    const after = text.slice(wordEnd);
    const hasSpaceAfter = /^\s/u.test(after);
    const inserted = `@${label}${hasSpaceAfter ? '' : ' '}`;
    const next = text.slice(0, at.start) + inserted + after;
    return { text: next, caret: at.start + inserted.length + (hasSpaceAfter ? 1 : 0) };
};

/**
 * The names the text holds after an `@` that starts a word — for each such `@`, the longest of
 * `labels` the text goes on with, unless the name runs on into more of a name (`NAME_RUNS_ON`).
 */
export const mentionedLabels = (text: string, labels: readonly string[]): Set<string> => {
    const longestFirst = [...new Set(labels.filter(Boolean))].sort((a, b) => b.length - a.length);
    const found = new Set<string>();
    for (const match of text.matchAll(/(?:^|\s)@/gu)) {
        const rest = text.slice((match.index ?? 0) + match[0].length);
        const hit = longestFirst.find(label => rest.startsWith(label) && !NAME_RUNS_ON.test(rest.slice(label.length)));
        if (hit) found.add(hit);
    }
    return found;
};

/**
 * The mention a send carries: the picks whose `@name` is still in the text. Nothing when none is left,
 * so a message with no mention sends no field at all.
 *
 * `knownLabels` are the other names the room's list offers. They settle a name that starts another
 * one: with both `민` and `민수` in the room, `@민수` names `민수`, never `민`, even if only `민` was picked.
 */
export const collectMention = (
    text: string,
    picks: readonly MentionPick[],
    knownLabels: readonly string[] = []
): ChatMentionBody | undefined => {
    const present = mentionedLabels(text, [...picks.map(pick => pick.label), ...knownLabels]);
    const kept = picks.filter(pick => present.has(pick.label));
    const userIds = [...new Set(kept.flatMap(pick => (pick.userId ? [pick.userId] : [])))];
    const all = kept.some(pick => pick.everyone);
    if (!userIds.length && !all) return undefined;
    return { ...(userIds.length ? { userIds } : {}), ...(all ? { all: true } : {}) };
};

/** Hangul compatibility jamo — a consonant or vowel typed on its own, before it joins a syllable. */
const TRAILING_JAMO = /[\u3131-\u318E]+$/u;

/**
 * The rows that answer what has been typed after `@`: a case-insensitive match anywhere in the label
 * or a keyword. Everything when nothing has been typed yet.
 *
 * A trailing lone jamo is left out of the match. On a Korean keyboard each syllable is typed as its
 * consonant first (`@민ㅅ` on the way to `@민수`), and matching it would empty the list at every other
 * keystroke — the list sits in the composer bar, so the whole conversation would jump each time.
 */
export const filterMentionCandidates = (candidates: readonly MentionCandidate[], query: string): MentionCandidate[] => {
    const needle = query.trim().replace(TRAILING_JAMO, '').toLowerCase();
    if (!needle) return [...candidates];
    return candidates.filter(candidate =>
        [candidate.label, ...(candidate.everyone ? EVERYONE_ALIASES : []), ...(candidate.keywords ?? [])].some(word =>
            word.toLowerCase().includes(needle)
        )
    );
};

/** The key of the everyone row in the suggestion list. */
export const EVERYONE_CANDIDATE_ID = '@everyone';

interface MentionCandidateSources {
    /** The room's active members. */
    memberIds: readonly string[];
    /** My uid in the room's cloud — never offered, since I do not mention myself. */
    me: string | null | undefined;
    /** The name every row in the room draws a person by; the text will read it after the pick. */
    nameOf: (id: string) => string;
    avatarOf: (id: string) => string | undefined;
    /** What `nameOf` answers for a person with no name yet — such a person cannot be written as one. */
    unknownLabel: string;
    /** The localized "everyone" title, so typing it finds the everyone row. */
    everyoneKeyword: string;
}

/** The suggestion list's rows for a group room: everyone first, then the members by name. */
export const buildMentionCandidates = ({
    memberIds,
    me,
    nameOf,
    avatarOf,
    unknownLabel,
    everyoneKeyword,
}: MentionCandidateSources): MentionCandidate[] => {
    const people = memberIds
        .filter(id => !!id && id !== me)
        .map(id => ({ id, label: nameOf(id), thumbnail: avatarOf(id) }))
        .filter(person => person.label !== unknownLabel)
        .sort((a, b) => a.label.localeCompare(b.label));
    return [
        { id: EVERYONE_CANDIDATE_ID, label: EVERYONE_MENTION, everyone: true, keywords: [everyoneKeyword] },
        ...people,
    ];
};
