/** The channel head and my read cursor — the only inputs the unread count needs. */
export interface UnreadInputs {
    /** `channel.chatNo` — the head of the unified user+system sequence. */
    headChatNo?: number;
    /** `channel.metaNo` — cumulative count of non-countable (join/leave) events at the head. */
    headMetaNo?: number;
    /** My read cursor on the user-message scale, or undefined when no join row is known yet. */
    readNo?: number;
}

/**
 * Unread user messages for one channel.
 *
 * The badge counts USER messages only. `chatNo` is one monotonic sequence over both user and
 * system messages and `metaNo` is the cumulative count of the system (non-countable) events, so
 * `chatNo - metaNo` is the user-message count at the head — the same scale the read cursor uses.
 *
 * No read cursor means no read boundary, which counts 0 rather than flashing a full count.
 *
 * Extracted so the home list ({@link useChannelUnreads}) and the search results share one formula;
 * a second copy is how the two screens would start disagreeing about the same channel.
 */
export const countUnread = ({ headChatNo, headMetaNo, readNo }: UnreadInputs): number => {
    if (readNo === undefined) return 0;

    const userHead = Math.max(0, (headChatNo ?? 0) - (headMetaNo ?? 0));
    return Math.max(0, userHead - readNo);
};

/** The freshest read position on a join row — `readNo` and `chatNo` both track it. */
export const readCursorOf = (join?: { readNo?: number; chatNo?: number }): number | undefined =>
    join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : undefined;
