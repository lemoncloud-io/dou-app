import type { DomainJoin } from '@chatic/data';

/** How many channel members have read a message, and how many have not. */
export interface ReadCount {
    readCount: number;
    unreadCount: number;
}

/**
 * Per-member read cursor from the channel's join rows.
 *
 * The API join model stores the last-read number in `chatNo`; our own row also carries an
 * explicit `readNo` from readChat's optimistic patch, so a member's position is
 * `max(readNo, chatNo)` — taken from the latest observed row, with no high-water mark of
 * our own (mirrors apps/web `useJoinPositions`).
 */
export const readCursorsOf = (joins: DomainJoin[]): Map<string, number> => {
    const cursors = new Map<string, number>();
    for (const join of joins) {
        if (!join.userId) continue;
        cursors.set(join.userId, Math.max(join.readNo ?? 0, join.chatNo ?? 0));
    }
    return cursors;
};

/**
 * A value signature of everything the receipt reads out of the join rows.
 *
 * The join cache re-emits the whole row set on any write to any field — a notification
 * mode, a role change — and the array is a new identity every time. Deriving off that
 * identity would hand every message row a fresh callback and re-render the feed for a
 * change no receipt can see, so the derivation keys off this instead.
 */
export const readStateKeyOf = (joins: DomainJoin[]): string =>
    joins
        .map(join => `${join.userId}:${Math.max(join.readNo ?? 0, join.chatNo ?? 0)}:${join.joined}`)
        .sort()
        .join('|');

/**
 * Members still in the channel (`joined !== 0`) — the receipt's denominator.
 *
 * Derived here rather than taken from the join list as a whole: the join cache keeps the
 * rows of people who left (`observeList` returns them unless `activeOnly` is asked for),
 * so counting rows directly would inflate the unread count by every departed member.
 */
export const activeMemberIdsOf = (joins: DomainJoin[]): string[] => {
    const ids = new Set<string>();
    for (const join of joins) {
        if (join.userId && join.joined !== 0) ids.add(join.userId);
    }
    return [...ids];
};

/**
 * How the active members stand against one message.
 *
 * A member whose join row has not synced yet has no cursor, so they count as unread until
 * it lands.
 *
 * The sender is read by definition — they wrote it. Their cursor is not reliable evidence
 * of that: the server does not auto-advance a read cursor on send, and this client only
 * reports one while the window is focused, so a message sent from a blurred window would
 * otherwise be reported as unread by its own author. `senderId` is the message's `ownerId`,
 * which for a persisted message is the same per-channel id the join rows are keyed by.
 */
export const countReadsAt = (
    chatNo: number,
    activeMemberIds: string[],
    cursorByUser: ReadonlyMap<string, number>,
    senderId?: string
): ReadCount => {
    let readCount = 0;
    for (const userId of activeMemberIds) {
        if (userId === senderId || (cursorByUser.get(userId) ?? 0) >= chatNo) readCount++;
    }
    return { readCount, unreadCount: activeMemberIds.length - readCount };
};
