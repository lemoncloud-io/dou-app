import { isMentioningViewer, type DomainChat } from '@chatic/data';

import { escapeRegExp, EVERYONE_ALIASES } from './mentionInput';

/**
 * The words a message's mentions are drawn on.
 *
 * Two marks. Every `@name` of a member of a group room, and every everyone word, is drawn as a
 * mention, on anyone's message — how it is written, not whom it calls. Drawn louder is a mention of
 * me, and whether a message calls me is never decided here: that is the message's mention record
 * (`isMentioningViewer`), which the sender's composer filled, the same record the push reads.
 */

/** The words readers treat as calling everyone in the room — the composer's everyone row answers them. */
export const GROUP_MENTION_TOKENS: readonly string[] = EVERYONE_ALIASES.map(word => `@${word}`);

/**
 * `@` + each name, once, then the everyone words. For me, the names are every name a sender's list
 * could have shown me under — my place nick, my nick, my account name — since the text holds whichever
 * one the sender saw.
 */
export const mentionTokensOf = (names: ReadonlyArray<string | null | undefined>): string[] => {
    const own = [...new Set(names.map(name => name?.trim()).filter((name): name is string => !!name))];
    return [...own.map(name => `@${name}`), ...GROUP_MENTION_TOKENS];
};

/** One run of a message's text, and whether it is a highlighted mention word. */
export interface MentionRun {
    value: string;
    mention: boolean;
}

/**
 * Splits plain text into runs, marking each whole-word, case-insensitive occurrence of a token.
 *
 * A token counts only at the start of the text or after whitespace, and not when a Latin letter, a
 * digit, `_` or `-` follows (`@Min` is not marked inside `@Minsu` or `@Min-jun`, nor inside `ops@Min`)
 * — the same rule the composer counts a pick by, so a Korean particle after the name (`@레인님`) still
 * marks it. The whitespace before it is kept in the run in front. No lookbehind: older WebKit, which
 * some shells still run, rejects the pattern.
 */
export const splitMentionRuns = (text: string, tokens: readonly string[]): MentionRun[] => {
    const words = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length).map(escapeRegExp);
    if (!text || words.length === 0) return text ? [{ value: text, mention: false }] : [];

    const pattern = new RegExp(`(^|\\s)(${words.join('|')})(?![A-Za-z0-9_-])`, 'giu');
    const runs: MentionRun[] = [];
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
        const lead = match[1];
        const start = (match.index ?? 0) + lead.length;
        if (start > cursor) runs.push({ value: text.slice(cursor, start), mention: false });
        runs.push({ value: match[2], mention: true });
        cursor = start + match[2].length;
    }
    if (cursor < text.length) runs.push({ value: text.slice(cursor), mention: false });
    return runs;
};

interface MentionViewerSources {
    /** My uid in the room's cloud — the id space of the room's member list, and of a mention record. */
    roomUid: string | null | undefined;
    /** The account's uid, which the room's cloud may not use. */
    sessionUid: string | null | undefined;
    /** My names in the room: the place profile's nick, then the member row's nick and name. */
    names: ReadonlyArray<string | null | undefined>;
    /**
     * The room's members, by the name every row draws them by — a group room's only. A 1:1 and a self
     * chat have no `@` list, so an `@name` in them is just text.
     */
    memberNames?: ReadonlyArray<string | null | undefined>;
    /** The members a mention can open, by the name the list writes them with. Me excluded. */
    people?: ReadonlyArray<MentionPerson>;
}

/** A member a mention names — enough to open their profile from it. */
export interface MentionPerson {
    id: string;
    name: string;
    avatar?: string;
}

/**
 * Me in the room, as a row needs me to draw mentions: every id I go by here, the words I am called,
 * and the words every member is mentioned by.
 */
export const mentionViewerOf = ({
    roomUid,
    sessionUid,
    names,
    memberNames,
    people = [],
}: MentionViewerSources): MentionViewer => ({
    ids: [...new Set([roomUid, sessionUid].filter((id): id is string => !!id))],
    tokens: mentionTokensOf(names),
    roomTokens: memberNames ? mentionTokensOf([...memberNames, ...names]) : [],
    people: new Map(people.map(person => [`@${person.name.trim()}`.toLowerCase(), person])),
});

/** What `mentionViewerOf` builds. */
export interface MentionViewer {
    ids: readonly string[];
    /** My names after `@`, and the everyone words. */
    tokens: readonly string[];
    /** Every member's name after `@`, mine included, and the everyone words. Empty outside a group room. */
    roomTokens: readonly string[];
    /** The member each `@name` (lower-cased) opens. */
    people: ReadonlyMap<string, MentionPerson>;
}

/** How one message's mentions are drawn — what `mentionMarksFor` answers. */
export interface MentionMarks {
    /** Every word drawn as a mention. */
    words: readonly string[];
    /** The ones drawn as calling me. */
    self: readonly string[];
    /** The message is mine: my bubble is dark, so its mentions take a mark that reads on it. */
    own: boolean;
    /** The member each `@name` (lower-cased) opens; an everyone word and my own name open nothing. */
    people: ReadonlyMap<string, MentionPerson>;
}

/**
 * Whether a message is drawn as calling me. The record decides when the message has one — what the
 * sender picked, the same record the push reads. A message without one (sent before mentions travelled
 * with the message, or through a path that does not carry them yet) falls back to its text, in a group
 * room only: my `@name` or an everyone word. My own message never calls me, even one calling everyone.
 */
const callsMe = (message: Pick<DomainChat, 'mention$'> & { isOwner?: boolean }, viewer: MentionViewer): boolean => {
    if (message.isOwner) return false;
    if (message.mention$) return isMentioningViewer(message, viewer.ids);
    return viewer.roomTokens.length > 0;
};

/** How a message's mentions are drawn, or nothing when it has none to draw. */
export const mentionMarksFor = (
    message: Pick<DomainChat, 'mention$'> & { isOwner?: boolean },
    viewer: MentionViewer | undefined
): MentionMarks | undefined => {
    if (!viewer) return undefined;
    const self = callsMe(message, viewer) ? viewer.tokens : [];
    const words = [...viewer.roomTokens, ...self];
    if (!words.length) return undefined;
    return { words, self, own: !!message.isOwner, people: viewer.people };
};
