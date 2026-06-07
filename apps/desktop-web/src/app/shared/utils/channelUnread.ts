import type { DomainChannel } from '@chatic/data';

/**
 * Unread count for a channel, computed client-side (mirrors apps/web useChannels).
 *
 * The server bumps `channel.chatNo` when a message is sent but does NOT advance
 * the sender's own read cursor (`$join.chatNo`), and the server-provided
 * `unreadCount` is eventually consistent. So we derive it locally:
 * - if the last message is mine, I've implicitly read up to it → unread 0;
 * - otherwise unread = latest chatNo − my read cursor.
 */
export const computeChannelUnread = (channel: DomainChannel, myUid: string | null): number => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    const lastMessageIsMine = !!myUid && channel.lastChat$?.ownerId === myUid;
    const myReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);
    const localUnread = Math.max(0, lastChatNo - myReadNo);
    return channel.$join ? localUnread : (channel.unreadCount ?? localUnread);
};
