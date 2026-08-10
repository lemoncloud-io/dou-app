import type { DomainChannel } from '@chatic/data';

import { isNotifiableChat } from './notifiableChat';

/**
 * A read boundary and the system-event count at it.
 *
 * The two fields are only meaningful together: `metaNo` is `channel.metaNo` as it stood at
 * `chatNo`, so pairing a cursor with someone else's `metaNo` mis-nets. Always read both from
 * the same record.
 */
export interface ReadCursor {
    /** Read position on the unified chat sequence (`join.chatNo`). */
    chatNo: number;
    /**
     * `channel.metaNo` snapshotted at the cursor (`join.metaNo`). Absent on join rows the
     * server wrote before it began keeping the snapshot — they pick it up on the next read.
     * The published `JoinModel` type does not expose it yet, so callers read it defensively.
     */
    metaNo?: number;
}

/** The cursor carried inline on the channel record, or undefined when no join row is synced. */
const joinCursorOf = (channel: DomainChannel): ReadCursor | undefined => {
    const join = channel.$join as { chatNo?: number; joinedNo?: number; metaNo?: number } | undefined;
    if (!join) return undefined;
    return { chatNo: Math.max(join.chatNo ?? 0, join.joinedNo ?? 0), metaNo: join.metaNo };
};

/**
 * Of two boundaries, the one that has read further — and on a tie, the one that carries the
 * `metaNo` snapshot. The join cache row and the channel's inline `$join` are separate records
 * with independent freshness, so the same cursor can arrive with the snapshot on one and without
 * it on the other; picking the bare one silently drops back to the un-netted count.
 */
const furthest = (a: ReadCursor | undefined, b: ReadCursor | undefined): ReadCursor | undefined => {
    if (!a) return b;
    if (!b) return a;
    if (a.chatNo !== b.chatNo) return a.chatNo > b.chatNo ? a : b;
    return a.metaNo !== undefined ? a : b;
};

/**
 * Unread count for a channel, computed client-side. Preference order, most-trusted first:
 *
 * 1. my own message is the latest → 0 (implicitly read up to it);
 * 2. a known read boundary → the count of *user* messages past it (see below), taking whichever
 *    of the observed join row (`cursor`, from the join cache via `useChannelReadCursors`) and the
 *    cursor embedded on the channel record (`$join`, delivered by channel.get/sync) has read
 *    further;
 * 3. no boundary tracked yet (join cache cold, never opened this session) → fall back to the
 *    server's `unreadCount`. It lags and won't clear on its own, but a later read advances the
 *    local cursor, which supersedes it with the derived value above.
 *
 * Whatever that yields is then capped by what this device has read (`localReadNo`, from
 * `useReadCursorStore`) — see the cap below.
 *
 * Falling back to `unreadCount` (rather than 0) is the fix for badges never showing when the join
 * read-cursor never seeds — the engine's eventually-consistent count is a worse boundary, but a
 * present-but-stale badge beats a silently-missing one.
 *
 * **The badge counts user messages, not chat slots.** `chatNo` is one monotonic sequence over both
 * user and system messages, and `metaNo` is the cumulative count of the system ones — so
 * `chatNo - metaNo` is the user-message count, on both the head and the cursor. Reactions are
 * system messages (`stereo: 'system'`, `subType: 'reaction'`), which is why a reaction to someone's
 * message used to raise a badge on a channel with nothing new to read: it takes a `chatNo` slot,
 * so the raw `head - read` delta counted it. Netting is what the rest of the app already does with
 * reactions — `isNotifiableChat` keeps them out of OS banners, `pickPreviewChat` keeps them out of
 * the sidebar preview — and what apps/web does with its own badge (`countUnread`).
 *
 * A join row with no `metaNo` nets nothing and degrades to the raw delta, which is the previous
 * behavior; it self-corrects the first time that channel is read.
 */
export const computeChannelUnread = (
    channel: DomainChannel,
    myUid: string | null,
    cursor: ReadCursor | undefined,
    localReadNo?: number
): number => {
    // Only a message someone wrote implies "read up to here" — a reaction I left on an unread
    // channel is the head too, and clearing on it would hide messages I never opened. Same
    // predicate the OS banner and the sidebar preview use, not a fourth copy of the rule.
    const last = channel.lastChat$;
    if (!!myUid && !!last && isNotifiableChat(last) && last.ownerId === myUid) return 0;

    const head = channel.chatNo ?? 0;
    const headMeta = channel.metaNo ?? 0;

    const boundary = furthest(cursor, joinCursorOf(channel));
    const derived = boundary
        ? Math.max(0, head - headMeta) - Math.max(0, boundary.chatNo - (boundary.metaNo ?? headMeta))
        : (channel.unreadCount ?? 0);

    // This device read up to `localReadNo`, so no more than the slots above it can be unread —
    // an upper bound however far behind the server cursor is, and 0 once it reaches the head.
    // Without it, reading a channel and then receiving one message would re-show the whole
    // backlog until the read receipt round-trips, which is what the local cursor exists to avoid.
    const cap = localReadNo === undefined ? head : Math.max(0, head - localReadNo);
    return Math.max(0, Math.min(derived, cap));
};
