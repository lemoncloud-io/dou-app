import type { DomainChat } from '@chatic/data';

/**
 * Whether this message has been changed since it was sent.
 *
 * The server carries no edit flag — no `editedAt`, no `isEdited` — so the only
 * signal available is that `updatedAt` has moved past `createdAt`. A freshly sent
 * message arrives with the two equal (observed on the wire: both `1785809147347`),
 * and nothing else writes the chat row: read cursors live on `$join`, and unread is
 * derived client-side from `(chatNo, metaNo)` rather than stored per message.
 *
 * Deleting also moves `updatedAt`, because the server's delete is a `PUT` on the same
 * row. That is excluded here rather than left to the caller: a deleted message renders
 * as a tombstone, and "This message was deleted. (edited)" is nonsense.
 *
 * The weakness is worth naming: this infers an edit from a timestamp instead of being
 * told about one. Any future server-side write to a chat row — a moderation flag, a
 * pin, a counter — would make every touched message read as edited. A field on the
 * model is the fix; this is what can be done without one.
 */
export const isEdited = (chat: DomainChat): boolean => {
    if (chat.hidden || chat.isPending) return false;
    const createdAt = chat.createdAt ?? 0;
    const updatedAt = chat.updatedAt ?? 0;
    return createdAt > 0 && updatedAt > createdAt;
};
