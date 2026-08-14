/** The channel head and my read cursor — the only inputs the unread count needs. */
export interface UnreadInputs {
    /** `channel.chatNo` — the head of the unified user+system sequence. */
    headChatNo?: number;
    /** `channel.metaNo` — cumulative count of non-countable (join/leave) events at the head. */
    headMetaNo?: number;
    /** My read cursor (`join.chatNo`/`readNo`) — also on the unified scale, not the user-message one. */
    readNo?: number;
    /**
     * `join.metaNo` — the channel's `metaNo` snapshotted at the read cursor. Falls back to
     * `headMetaNo` when absent (rows written before the server started snapshotting it, see
     * ADR-0048) — an approximation, but the ADR's documented one.
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
 * No read cursor means no read boundary, which counts 0 rather than flashing a full count.
 *
 * Extracted so the home list ({@link useChannelUnreads}) and the search results share one formula;
 * a second copy is how the two screens would start disagreeing about the same channel.
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
