/** The channel head and my read cursor — the only inputs the unread count needs. */
export interface UnreadInputs {
    /** `channel.chatNo` — the head of the unified user+system sequence. */
    headChatNo?: number;
    /** `channel.metaNo` — cumulative count of non-countable (join/leave) events at the head. */
    headMetaNo?: number;
    /** My read cursor (`join.chatNo`/`readNo`) — also on the unified scale, not the user-message one. */
    readNo?: number;
    /**
     * `join.metaNo` — the channel's `metaNo` snapshotted at the read cursor. Absent on rows written
     * before the server started snapshotting it (ADR-0048); see below for what that costs.
     */
    readMetaNo?: number;
}

/**
 * Unread user messages for one channel.
 *
 * The badge counts USER messages only. `chatNo` is one monotonic sequence over both user and
 * system messages and `metaNo` is the cumulative count of the system (non-countable) events at
 * that point in the sequence, so `chatNo - metaNo` is the user-message count there. The head and
 * the read cursor are two different points in the same sequence, so BOTH must be converted with
 * their OWN `metaNo` snapshot before being compared (ADR-0048) — netting only the head and
 * subtracting a still-unified-scale cursor undercounts by however many system events happened
 * between the cursor and the head.
 *
 * When the cursor carries NO snapshot of its own (a join row written before the server started
 * snapshotting `metaNo`), the head's `metaNo` stands in for it — the ADR's documented fallback, and
 * the same one the server's `calcUnreadCount` applies. It is an approximation in a known direction:
 * `headMetaNo >= readMetaNo` always, so the count comes out HIGH by the system events between the
 * cursor and the head. Reading the room once repairs the row for good, because the server then
 * answers `join.read` with a cursor AND its snapshot and this branch stops applying.
 *
 * Subtracting the cursor unconverted (`userHead - readNo`) was tried as the alternative and
 * abandoned: it errs low instead, which hides genuinely unread messages. See ADR-0048 — the
 * trade-off between the two is recorded there, and the count is only ever approximate while a
 * snapshot-less row exists.
 *
 * No read cursor means no read boundary, which counts 0 rather than flashing a full count.
 *
 * Extracted so the home list ({@link useChannelUnreads}) and the search results share one formula;
 * a second copy is how the two screens would start disagreeing about the same channel. Callers
 * holding a channel row go through {@link unreadOf}, which also picks the cursor.
 */
export const countUnread = ({ headChatNo, headMetaNo, readNo, readMetaNo }: UnreadInputs): number => {
    if (readNo === undefined) return 0;

    const metaNo = headMetaNo ?? 0;
    const userHead = Math.max(0, (headChatNo ?? 0) - metaNo);
    const cursorMetaNo = readMetaNo ?? metaNo;
    return Math.max(0, userHead - (readNo - cursorMetaNo));
};

/** The freshest read position on a join row — `readNo` and `chatNo` both track it. */
export const readCursorOf = (join?: { readNo?: number; chatNo?: number }): number | undefined =>
    join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : undefined;

/** A read position with the `metaNo` snapshotted at it — a join row, or the one a channel row carries. */
export interface ReadPosition {
    readNo?: number;
    chatNo?: number;
    metaNo?: number;
}

/**
 * My read position in a channel: whichever of my join row and the channel's embedded `$join` is
 * further along.
 *
 * Each is fresher at a different moment. The join row moves the instant I read on this device — the
 * embedded copy only catches up on the next channel delta. But the channel delta is the ONLY thing
 * that moves a cloud's cursors while that cloud is off screen: it writes channel rows, never join
 * rows, so a read made on another device reaches this one through `$join` alone. A read position
 * only moves forward, so the one further along is the true one either way.
 *
 * On a tie the one carrying its own `metaNo` snapshot wins — the same cursor converted exactly
 * instead of through the head's fallback (see {@link countUnread}).
 */
export const readPositionOf = (join?: ReadPosition, embedded?: ReadPosition): ReadPosition | undefined => {
    const own = readCursorOf(join);
    const carried = readCursorOf(embedded);
    if (carried === undefined) return join;
    if (own === undefined) return embedded;
    if (carried > own) return embedded;
    if (carried === own && join?.metaNo === undefined && embedded?.metaNo !== undefined) return embedded;
    return join;
};

/** The channel fields the count reads: its head, and the read position it carries. */
export interface UnreadChannel {
    chatNo?: number;
    metaNo?: number;
    $join?: ReadPosition;
}

/** Unread user messages in `channel` for me, given my join row there if one is cached. */
export const unreadOf = (channel: UnreadChannel, join?: ReadPosition): number => {
    const position = readPositionOf(join, channel.$join);
    return countUnread({
        headChatNo: channel.chatNo,
        headMetaNo: channel.metaNo,
        readNo: readCursorOf(position),
        readMetaNo: position?.metaNo,
    });
};
