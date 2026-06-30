import type { DomainChannel } from '@chatic/data';

import { lastChatNoOf } from './channelMerge';

/**
 * Combine my server read cursor (observed join row, via useChannelReadCursors) with the local
 * one (useReadCursorStore, advanced the instant I read) into a single read boundary. `undefined`
 * means "no read boundary known yet" → the channel shows no badge (mirrors apps/web — a channel
 * with no join row is counted as 0 by design, never as fully-unread).
 */
export const resolveReadNo = (
    channelId: string,
    serverReadNo: Record<string, number>,
    localReadNo: Record<string, number>
): number | undefined => {
    const server = serverReadNo[channelId];
    const local = localReadNo[channelId];
    if (server === undefined && local === undefined) return undefined;
    return Math.max(server ?? 0, local ?? 0);
};

/**
 * Unread count for a channel, computed client-side. Preference order, most-trusted first:
 *
 * 1. my own message is the latest → 0 (implicitly read up to it);
 * 2. a known read boundary → `max(0, latestChatNo − read)`, where `read` is the furthest-read of
 *    the combined cursor (`readNo`, from the server join cache + local read store via
 *    `resolveReadNo`) and the cursor embedded on the channel record (`$join.chatNo`, delivered by
 *    channel.get/sync). This derivation clears the instant I read (local cursor advances);
 * 3. no boundary tracked yet (join cache cold, never opened this session) → fall back to the
 *    server's `unreadCount` so the badge still appears. It lags and won't clear on its own, but a
 *    later read advances the local cursor, which supersedes it with the derived value above.
 *
 * Falling back to `unreadCount` (rather than 0) is the fix for badges never showing when the join
 * read-cursor never seeds — the engine's eventually-consistent count is a worse boundary, but a
 * present-but-stale badge beats a silently-missing one.
 */
export const computeChannelUnread = (
    channel: DomainChannel,
    myUid: string | null,
    readNo: number | undefined
): number => {
    if (!!myUid && channel.lastChat$?.ownerId === myUid) return 0;

    const last = lastChatNoOf(channel);
    const known = [readNo, channel.$join?.chatNo].filter((n): n is number => typeof n === 'number');
    if (known.length > 0) return Math.max(0, last - Math.max(...known));

    return typeof channel.unreadCount === 'number' ? Math.max(0, channel.unreadCount) : 0;
};
