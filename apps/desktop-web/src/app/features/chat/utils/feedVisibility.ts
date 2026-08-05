import type { DomainChat } from '@chatic/data';

/**
 * Whether a chat belongs in the main channel feed.
 *
 * Two reasons to hide a row arrived from different directions and, kept apart, they
 * drift: thread replies live in the panel (ADR 0008), and reaction events are ordinary
 * chats the reader must never see as messages — they are the input to `foldReactions`
 * and appear as chips under the message they point at.
 *
 * Deleted messages stay. The server's delete is a soft delete — `chat.delete` maps to
 * `PUT { hidden: true }`, so the row survives and comes back on the next sync — and the
 * feed keeps it in place as "This message was deleted." rather than closing the gap.
 * A message that simply disappears leaves the people who were reading it with no account
 * of what happened; a tombstone says a message was there and is not any more, which is
 * the thing they need to know. `MessageRow` renders that in place of the content.
 *
 * System rows (join/leave) are deliberately visible too — they render as a notice line
 * rather than a message.
 */
export const isFeedVisible = (chat: DomainChat): boolean => !chat.parentId && chat.subType !== 'reaction';
