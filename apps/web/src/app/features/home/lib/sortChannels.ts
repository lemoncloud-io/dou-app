import type { DomainChannel, DomainJoin } from '@chatic/data';

import type { ChannelSortMethod } from '../../../stores/preferenceKeys';

// Coerce a possibly-string/number timestamp to epoch ms for comparison (0 when absent/invalid).
export const toTime = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export interface SortChannelsInput {
    channels: DomainChannel[];
    /** My join per channel (subscribed join list) — freshest activity time source. */
    joinByChannel?: Map<string, DomainJoin>;
    /** Unread count per channel id — drives the 'unread' method. */
    unreadByChannel: Record<string, number>;
    sortMethod: ChannelSortMethod;
    /** Channel ids pinned in this place (client-only preference) — floated above everything. */
    pinnedChannelIds?: ReadonlySet<string>;
}

/**
 * Order channels for the home list by the place's chosen sort method (pure — unit-tested).
 * Base order is always most-recent-activity first (join updatedAt → embedded $join → channel
 * activity). 'unread' then floats channels with unread messages above read ones, keeping the
 * activity order within each group (Array.sort is stable). 'recent' returns the base order.
 * Pinned channels are floated last of all, so a pin always wins over the sort method.
 */
export const sortChannels = ({
    channels,
    joinByChannel,
    unreadByChannel,
    sortMethod,
    pinnedChannelIds,
}: SortChannelsInput): DomainChannel[] => {
    const activityAt = (channel: DomainChannel): number =>
        toTime(joinByChannel?.get(channel.id)?.updatedAt ?? channel.$join?.updatedAt) ||
        toTime(channel.lastActivityAt ?? channel.updatedAt);
    const byActivity = [...channels].sort((left, right) => activityAt(right) - activityAt(left));
    if (sortMethod === 'unread') {
        const hasUnread = (channel: DomainChannel): number => ((unreadByChannel[channel.id] ?? 0) > 0 ? 1 : 0);
        byActivity.sort((left, right) => hasUnread(right) - hasUnread(left));
    }
    if (!pinnedChannelIds?.size) return byActivity;
    const isPinned = (channel: DomainChannel): number => (pinnedChannelIds.has(channel.id) ? 1 : 0);
    return byActivity.sort((left, right) => isPinned(right) - isPinned(left));
};
