import { isMentioningViewer } from '@chatic/runtime-react';
import type { DomainChat } from '@chatic/runtime-react';

export const GROUP_MENTIONS = ['@channel', '@here', '@everyone', '@all', '@전체'];

export const MENTION_TOKEN_SOURCE = '[\\p{L}\\p{N}_.-]';

const GROUP_MENTION_PATTERN = new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])(?:${GROUP_MENTIONS.join('|')})(?![\\p{L}\\p{N}_-])`,
    'iu'
);

const BOUNDARY_BEFORE = /[\p{L}\p{N}_-]/u;

export const isMentionBoundary = (text: string, index: number): boolean =>
    index <= 0 || !BOUNDARY_BEFORE.test(text[index - 1] ?? '');

const mentionsNameInText = (text: string, names: Array<string | null | undefined>): boolean => {
    if (!text.includes('@')) return false;
    const lower = text.toLowerCase();
    return names.some(raw => {
        const name = raw?.trim().toLowerCase();
        return !!name && lower.includes(`@${name}`);
    });
};

export const isMentioned = (content: string, names: Array<string | null | undefined>): boolean => {
    if (!content.includes('@')) return false;
    if (mentionsNameInText(content, names)) return true;
    return GROUP_MENTION_PATTERN.test(content);
};

export type MentionKind = 'direct' | 'everyone';

export const mentionKind = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>,
    text: string,
    names: Array<string | null | undefined>
): MentionKind | null => {
    if (chat.mention$) {
        if (isNamedByRecord(chat, viewerIds)) return 'direct';
        return isMentioningViewer(chat, viewerIds) ? 'everyone' : null;
    }
    if (mentionsNameInText(text, names)) return 'direct';
    if (GROUP_MENTION_PATTERN.test(text)) return 'everyone';
    return null;
};

export const isNamedByRecord = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>
): boolean => {
    const ids = chat.mention$?.userIds ?? [];
    return viewerIds.some(id => !!id && ids.includes(id));
};

export const mentionsMe = (
    chat: Pick<DomainChat, 'mention$'>,
    viewerIds: ReadonlyArray<string | null | undefined>,
    text: string,
    names: Array<string | null | undefined>
): boolean => mentionKind(chat, viewerIds, text, names) !== null;
