import type { DomainChannel } from '@chatic/data';

/**
 * Unread count for a channel, computed client-side (mirrors apps/web useChannels).
 *
 * The server bumps `channel.chatNo` when a message is sent but does NOT advance
 * the sender's own read cursor (`$join.chatNo`), and the server-provided
 * `unreadCount` is eventually consistent. So we derive it locally:
 * - if the last message is mine, I've implicitly read up to it → unread 0;
 * - otherwise unread = latest chatNo − my read cursor.
 *
 * `localReadNo` is this client's own read position (see useReadCursorStore). It
 * takes precedence over the lagging server cursor so a channel we just read
 * never flashes an unread badge while the server catches up.
 */
export const computeChannelUnread = (channel: DomainChannel, myUid: string | null, localReadNo = 0): number => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    if (localReadNo >= lastChatNo) return 0;

    const lastMessageIsMine = !!myUid && channel.lastChat$?.ownerId === myUid;
    const serverReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);
    const readNo = Math.max(serverReadNo, localReadNo);
    const derived = Math.max(0, lastChatNo - readNo);
    return channel.$join ? derived : (channel.unreadCount ?? derived);
};
