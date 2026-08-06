import type { DomainChat } from '@chatic/data';

import { ROUTES } from '../../routes/paths';

/**
 * The thread route a notified chat belongs to, or `null` when it belongs in the room.
 *
 * Push notifications are channel-level: the link names a channel, so a tap lands on the
 * channel room. But a thread reply is an ordinary `stereo:'user'` chat, so it raises a push
 * of its own while being hidden from the main feed (`isFeedVisible`, ADR-0045) — landing in
 * the room would show the reader everything except the message they were notified about.
 *
 * So the room is the first stop, not the destination: once there, the notified chat answers
 * whether a thread hop is owed. `null` is the common, correct answer — a top-level message
 * needs no hop, and neither does a chat we could not resolve. The caller then simply stays
 * in the room, which is why every failure here is silent rather than surfaced.
 *
 * `parentId` on a persisted reply is already the root's `chatNo` string, which is exactly
 * what the thread route's `:rootNo` wants. The `:`-stripping guard covers the optimistic
 * encoding (the full `<channelId>:<chatNo>` id, see `buildThread`'s contract note) in case
 * a locally-written row is what got read back.
 */
export const resolveThreadTarget = (chat: DomainChat | null | undefined, chatId: string): string | null => {
    const parentId = chat?.parentId;
    if (!parentId) return null;

    // A chat's id is `<channelId>:<chatNo>`, so the channel is derivable from either side.
    const channelId = chat?.channelId || chatId.split(':')[0];
    if (!channelId) return null;

    const rootNo = parentId.includes(':') ? parentId.split(':').pop() : parentId;
    if (!rootNo) return null;

    return ROUTES.channels.thread(channelId, rootNo);
};
