import { isEventChat, isNotifiableChat } from './chatPreview';
import type { DomainChat } from './models';

export const CHAT_NOTIFICATION_ENTRIES_VERSION = 1;

export type ChatNotificationKind = 'mention' | 'everyone' | 'reply' | 'reaction';

export interface ChatNotificationEntry {
    kind: ChatNotificationKind;
    ref: string;
    chatId: string;
    channelId: string;
    chatNo: number;
    createdAt: number;
    authorId?: string;
    emoji?: string;
    action?: 'on' | 'off';
}

const isEveryone = (all: unknown): boolean => all === true || all === 1;

const authorOf = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId ?? undefined;

const isSettledRow = (chat: DomainChat): boolean =>
    !!chat.id && !!chat.chatNo && chat.chatNo > 0 && !chat.isPending && !chat.isFailed && !chat.hidden;

export const isNotifiableMessage = (chat: DomainChat): boolean =>
    isSettledRow(chat) && isNotifiableChat(chat) && !isEventChat(chat);

export const chatNotificationEntries = (chat: DomainChat): ChatNotificationEntry[] => {
    if (!isSettledRow(chat)) return [];
    const base = {
        chatId: chat.id,
        channelId: chat.channelId,
        chatNo: chat.chatNo as number,
        createdAt: chat.createdAt ?? 0,
        authorId: authorOf(chat),
    };

    if (chat.subType === 'reaction') {
        const reaction = chat.reaction$;
        if (!reaction?.chatId || !reaction.emoji) return [];
        return [
            {
                ...base,
                kind: 'reaction',
                ref: reaction.chatId,
                emoji: reaction.emoji,
                action: reaction.action === 'off' ? 'off' : 'on',
            },
        ];
    }
    if (!isNotifiableMessage(chat)) return [];

    const entries: ChatNotificationEntry[] = [];
    const named = Array.from(new Set((chat.mention$?.userIds ?? []).filter(Boolean)));
    for (const userId of named) entries.push({ ...base, kind: 'mention', ref: userId });
    if (isEveryone(chat.mention$?.all)) entries.push({ ...base, kind: 'everyone', ref: '' });
    if (chat.parentId) entries.push({ ...base, kind: 'reply', ref: chat.parentId });
    return entries;
};
