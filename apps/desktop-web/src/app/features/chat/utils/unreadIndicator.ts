/** How a sidebar row should show its unread state. */
export type UnreadIndicator = 'none' | 'dot' | 'count';

interface UnreadIndicatorInput {
    /** Derived unread count — `channel.unreadCount` after useChannels overwrites it. */
    unread: number | undefined;
    /** DM or self channel. Those live in the sidebar's DM bucket. */
    isDm: boolean;
    /** The row currently open. */
    isActive: boolean;
}

/**
 * Decides the *shape* of a row's unread badge, never the number behind it —
 * that is `computeChannelUnread`'s job, and `useChannels` has already written
 * its result onto `channel.unreadCount` by the time a row reads it.
 *
 * Channels get a dot and DMs get the count because the magnitude only changes
 * behaviour in one of the two. Channel traffic is ambient: 3 unread or 47, you
 * open it and skim. A DM's count is reply debt, and 1 vs 12 is a different
 * afternoon. Showing the number everywhere made every row equally loud, which
 * is the same as no signal at all.
 *
 * The open row stays silent regardless — pre-existing behaviour, folded in so a
 * sidebar row asks this question once instead of deriving it twice.
 *
 * Scope is the channel sidebar. The place and cloud rails badge on their own
 * rules (`PlaceRail` always counts, `CloudRail` always dots) and do not come
 * through here — changing this function does not change them.
 */
export const unreadIndicator = ({ unread, isDm, isActive }: UnreadIndicatorInput): UnreadIndicator => {
    if (isActive) return 'none';
    if (!unread || unread <= 0) return 'none';
    return isDm ? 'count' : 'dot';
};
