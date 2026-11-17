import type { ClientChatView } from '../types';

/**
 * Where a room's unread messages start, as the room had them when it was entered: the first drawn
 * message from someone else newer than my read cursor at entry. My own messages and system notices
 * are never unread to me, so neither can open the run.
 *
 * `unknown` while the drawn window may not reach back far enough to tell — its oldest row is
 * already newer than the cursor and older history exists; `none` when nothing is unread. A caller
 * that cannot widen the window any further asks again with `hasOlder` false and takes what is drawn.
 */
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
    // The window starts after the cursor: an older unread message may sit above what is drawn.
    const oldest = messages.find(message => message.chatNo !== undefined)?.chatNo;
    if (hasOlder && oldest !== undefined && oldest > entryCursor + 1) return { kind: 'unknown' };
    return { kind: 'at', chatNo: first.chatNo };
};
