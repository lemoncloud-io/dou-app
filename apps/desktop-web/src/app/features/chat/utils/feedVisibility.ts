import type { DomainChat } from '@chatic/data';

/**
 * Whether a chat belongs in the main channel feed *on its own merits*.
 *
 * Three separate reasons to hide a row arrived from three different directions and,
 * kept apart, they drift: thread replies live in the panel (ADR 0008), deleted messages
 * come back from the server as `hidden` rows rather than disappearing, and reaction
 * events are ordinary chats the reader must never see as messages.
 *
 * Not the whole feed rule. `isDeletedThreadRoot` grants an exception this predicate
 * cannot see, because it depends on the thread index rather than the chat alone — so
 * a feed reads `isFeedVisible(c) || isDeletedThreadRoot(c, threadIndex)`, and any new
 * feed-like surface has to do the same.
 *
 * A deleted message is worth spelling out. The server's delete is a soft delete —
 * `chat.delete` maps to `PUT { hidden: true }`, so the row survives and returns on
 * the next sync. The repository deletes it from the local cache immediately, which
 * makes the message vanish right away, but that optimistic removal alone would be
 * undone the moment the cache refills. Filtering on `hidden` here is what makes the
 * two agree.
 *
 * System rows (join/leave) are deliberately *visible* — they render as a notice line
 * rather than a message. Reaction events are system rows too, but they are the input to
 * `foldReactions`, not something to read: they appear as chips under the message they
 * point at, never as a row of their own.
 */
export const isFeedVisible = (chat: DomainChat): boolean =>
    !chat.parentId && !chat.hidden && chat.subType !== 'reaction';

/**
 * A deleted message that other people replied to.
 *
 * Deleting normally removes the row outright, which is what Slack does and what the
 * reader expects. A thread root is the exception: its replies are matched to it by id,
 * so removing it would leave a conversation hanging off nothing — the replies would
 * still exist with no way to reach them and no indication of what they answered. Those
 * roots keep their place in the feed as a tombstone.
 *
 * "Replied to" means replies are actually loaded. A root whose thread has not been
 * paged in yet reads as an ordinary message and is removed like one; if the replies
 * arrive later the tombstone appears with them, which is the same information showing
 * up at the same time as the reason to show it.
 */
export const isDeletedThreadRoot = (chat: DomainChat, threadIndex: ReadonlyMap<string, unknown>): boolean =>
    !!chat.hidden && !chat.parentId && chat.chatNo != null && threadIndex.has(String(chat.chatNo));
