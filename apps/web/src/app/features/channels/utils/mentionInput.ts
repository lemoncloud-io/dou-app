import type { ChatMentionBody } from '@chatic/runtime';

export const EVERYONE_ALIASES: readonly string[] = ['all', '전체', 'channel', 'here', 'everyone'];

const NAME_RUNS_ON = /^[A-Za-z0-9_-]/u;

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export interface MentionPick {
    label: string;
    userId?: string;
    everyone?: boolean;
}

export interface MentionCandidate {
    id: string;
    label: string;
    thumbnail?: string;
    everyone?: boolean;
    keywords?: readonly string[];
}

export interface MentionQuery {
    start: number;
    query: string;
}

const QUERY_MAX = 30;

export const findMentionQuery = (text: string, caret: number): MentionQuery | null => {
    const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
    const match = /(?:^|\s)@([^\s@]*)$/u.exec(before);
    if (!match) return null;
    const query = match[1];
    if (query.length > QUERY_MAX) return null;
    return { start: before.length - query.length - 1, query };
};

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

export interface MentionRange {
    start: number;
    end: number;
    label: string;
}

export const mentionRanges = (text: string, labels: readonly string[]): MentionRange[] => {
    const longestFirst = [...new Set(labels.filter(Boolean))].sort((a, b) => b.length - a.length);
    const ranges: MentionRange[] = [];
    for (const match of text.matchAll(/(?:^|\s)@/gu)) {
        const start = (match.index ?? 0) + match[0].length - 1;
        const rest = text.slice(start + 1);
        const hit = longestFirst.find(label => rest.startsWith(label) && !NAME_RUNS_ON.test(rest.slice(label.length)));
        if (hit) ranges.push({ start, end: start + 1 + hit.length, label: hit });
    }
    return ranges;
};

export const mentionedLabels = (text: string, labels: readonly string[]): Set<string> =>
    new Set(mentionRanges(text, labels).map(range => range.label));

export const removeWholeMention = (
    previous: string,
    next: string,
    picked: readonly string[],
    known: readonly string[] = []
): { text: string; caret: number; label: string } | null => {
    if (!picked.length || next.length > previous.length) return null;
    let head = 0;
    while (head < next.length && previous[head] === next[head]) head += 1;
    let tail = 0;
    while (tail < next.length - head && previous[previous.length - 1 - tail] === next[next.length - 1 - tail]) {
        tail += 1;
    }
    const removedEnd = previous.length - tail;
    const inserted = next.slice(head, next.length - tail);
    if (removedEnd <= head || (inserted && !/^[\u3131-\u318E]$/u.test(inserted))) return null;
    const range = mentionRanges(previous, [...picked, ...known]).find(
        candidate => candidate.end === removedEnd && head > candidate.start && picked.includes(candidate.label)
    );
    if (!range) return null;
    return { text: previous.slice(0, range.start) + previous.slice(range.end), caret: range.start, label: range.label };
};

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

const TRAILING_JAMO = /[\u3131-\u318E]+$/u;

export const filterMentionCandidates = (candidates: readonly MentionCandidate[], query: string): MentionCandidate[] => {
    const needle = query.trim().replace(TRAILING_JAMO, '').toLowerCase();
    if (!needle) return [...candidates];
    return candidates.filter(candidate =>
        [candidate.label, ...(candidate.everyone ? EVERYONE_ALIASES : []), ...(candidate.keywords ?? [])].some(word =>
            word.toLowerCase().includes(needle)
        )
    );
};

export const EVERYONE_CANDIDATE_ID = '@everyone';

interface MentionCandidateSources {
    memberIds: readonly string[];
    me: string | null | undefined;
    nameOf: (id: string) => string;
    avatarOf: (id: string) => string | undefined;
    unknownLabel: string;
    everyoneKeyword: string;
    everyoneLabel: string;
}

export const buildMentionCandidates = ({
    memberIds,
    me,
    nameOf,
    avatarOf,
    unknownLabel,
    everyoneKeyword,
    everyoneLabel,
}: MentionCandidateSources): MentionCandidate[] => {
    const people = memberIds
        .filter(id => !!id)
        .map(id => ({ id, label: nameOf(id), thumbnail: avatarOf(id) }))
        .filter(person => person.label !== unknownLabel)
        .sort((a, b) => Number(a.id === me) - Number(b.id === me) || a.label.localeCompare(b.label));
    return [
        { id: EVERYONE_CANDIDATE_ID, label: everyoneLabel, everyone: true, keywords: [everyoneKeyword] },
        ...people,
    ];
};
