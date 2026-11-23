import type { ChatMentionBody } from '@lemoncloud/chatic-socials-api';
import type { ChatSendInput } from '@lemoncloud/chatic-sockets-lib';

import type { DomainChat } from './models';

export type { ChatMentionBody };

export type ChatSendPayload = ChatSendInput & { mention?: ChatMentionBody };

type MentionRecord = DomainChat['mention$'];

const isEveryone = (all: unknown): boolean => all === true || all === 1;

export const isMentioningViewer = (
    chat: Pick<DomainChat, 'mention$'> | null | undefined,
    viewerIds: ReadonlyArray<string | null | undefined>
): boolean => {
    const record = chat?.mention$;
    if (!record) return false;
    if (isEveryone(record.all)) return true;
    const ids = record.userIds ?? [];
    return viewerIds.some(id => !!id && ids.includes(id));
};

export const toMentionRecord = (mention: ChatMentionBody | null | undefined): MentionRecord | undefined => {
    if (!mention) return undefined;
    const userIds = mention.userIds?.filter(Boolean) ?? [];
    const all = mention.all === true;
    if (!userIds.length && !all) return undefined;
    return { ...(userIds.length ? { userIds } : {}), ...(all ? { all: true } : {}) };
};

export const toMentionBody = (record: MentionRecord | null | undefined): ChatMentionBody | undefined => {
    if (!record) return undefined;
    const userIds = record.userIds?.filter(Boolean) ?? [];
    const all = isEveryone(record.all);
    if (!userIds.length && !all) return undefined;
    return { ...(userIds.length ? { userIds } : {}), ...(all ? { all: true } : {}) };
};
