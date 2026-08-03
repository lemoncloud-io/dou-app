import type { DomainChat } from '@chatic/data';

/**
 * Whether a chat belongs in the main channel feed.
 *
 * This is the single place that answers "should this row appear", because three
 * separate reasons to hide a row arrived from three different directions and, kept
 * apart, they drift: thread replies live in the panel (ADR 0008), deleted messages
 * come back from the server as `hidden` rows rather than disappearing, and reaction
 * events are ordinary chats the reader must never see as messages.
 *
 * A deleted message is worth spelling out. The server's delete is a soft delete —
 * `chat.delete` maps to `PUT { hidden: true }`, so the row survives and returns on
 * the next sync. The repository deletes it from the local cache immediately, which
 * makes the message vanish right away, but that optimistic removal alone would be
 * undone the moment the cache refills. Filtering on `hidden` here is what makes the
 * two agree.
 *
 * System rows (join/leave) are deliberately *visible* — they render as a notice line
 * rather than a message. Reaction events are system rows too but must not appear;
 * that clause arrives with the reaction slice, once the installed contract package
 * actually has `'reaction'` in `ChatSubType`.
 */
export const isFeedVisible = (chat: DomainChat): boolean => !chat.parentId && !chat.hidden;
