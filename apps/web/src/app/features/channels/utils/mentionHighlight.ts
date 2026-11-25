import { isMentioningViewer, type DomainChat } from '@chatic/runtime-react';

import { escapeRegExp, EVERYONE_ALIASES } from './mentionInput';

export const GROUP_MENTION_TOKENS: readonly string[] = EVERYONE_ALIASES.map(word => `@${word}`);

const GROUP_WORDS = new Set(GROUP_MENTION_TOKENS.map(word => word.toLowerCase()));

export const mentionTokensOf = (names: ReadonlyArray<string | null | undefined>): string[] => {
    const own = [...new Set(names.map(name => name?.trim()).filter((name): name is string => !!name))];
    return [...own.map(name => `@${name}`), ...GROUP_MENTION_TOKENS];
};

export interface MentionRun {
    value: string;
    mention: boolean;
}

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
    roomUid: string | null | undefined;
    sessionUid: string | null | undefined;
    names: ReadonlyArray<string | null | undefined>;
    memberNames?: ReadonlyArray<string | null | undefined>;
    people?: ReadonlyArray<MentionPerson>;
}

export interface MentionPerson {
    id: string;
    name: string;
    avatar?: string;
}

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
    people: new Map(
        people
            .map(person => [`@${person.name.trim()}`.toLowerCase(), person] as const)
            .filter(([word]) => !GROUP_WORDS.has(word))
    ),
});

export interface MentionViewer {
    ids: readonly string[];
    tokens: readonly string[];
    roomTokens: readonly string[];
    people: ReadonlyMap<string, MentionPerson>;
}

export interface MentionMarks {
    words: readonly string[];
    self: readonly string[];
    own: boolean;
    people: ReadonlyMap<string, MentionPerson>;
}

const callsMe = (message: Pick<DomainChat, 'mention$'> & { isOwner?: boolean }, viewer: MentionViewer): boolean => {
    if (message.isOwner) return false;
    if (message.mention$) return isMentioningViewer(message, viewer.ids);
    return viewer.roomTokens.length > 0;
};

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
