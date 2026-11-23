import type { ClientChatView } from '../types';

export type UnreadEntry = { kind: 'unknown' } | { kind: 'none' } | { kind: 'at'; chatNo: number };

export const unreadEntryOf = (
    messages: readonly ClientChatView[],
    entryCursor: number,
    hasOlder: boolean
): UnreadEntry => {
    const first = messages.find(
        message => !message.isOwner && !message.isSystem && message.chatNo !== undefined && message.chatNo > entryCursor
    );
    if (!first || first.chatNo === undefined) return { kind: 'none' };
    const oldest = messages.find(message => message.chatNo !== undefined)?.chatNo;
    if (hasOlder && oldest !== undefined && oldest > entryCursor + 1) return { kind: 'unknown' };
    return { kind: 'at', chatNo: first.chatNo };
};
