import type { DomainChannel, DomainChat } from '@chatic/runtime-react';

import type { ChannelSortMethod } from '../stores/preferenceKeys';

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
    lastChatByChannel?: ReadonlyMap<string, DomainChat>;
    unreadByChannel: Record<string, number>;
    sortMethod: ChannelSortMethod;
    pinnedChannelIds?: ReadonlySet<string>;
    leadsWithSelf?: boolean;
}

export const sortChannels = ({
    channels,
    lastChatByChannel,
    unreadByChannel,
    sortMethod,
    pinnedChannelIds,
    leadsWithSelf,
}: SortChannelsInput): DomainChannel[] => {
    const activityAt = (channel: DomainChannel): number => {
        const lastChat = lastChatByChannel?.get(channel.id);
        return toTime(lastChat?.createdAtMs ?? lastChat?.createdAt) || toTime(channel.updatedAt);
    };
    const byActivity = [...channels].sort((left, right) => activityAt(right) - activityAt(left));
    if (sortMethod === 'unread') {
        const hasUnread = (channel: DomainChannel): number => ((unreadByChannel[channel.id] ?? 0) > 0 ? 1 : 0);
        byActivity.sort((left, right) => hasUnread(right) - hasUnread(left));
    }
    if (pinnedChannelIds?.size) {
        const isPinned = (channel: DomainChannel): number => (pinnedChannelIds.has(channel.id) ? 1 : 0);
        byActivity.sort((left, right) => isPinned(right) - isPinned(left));
    }
    if (!leadsWithSelf) return byActivity;
    const isSelf = (channel: DomainChannel): number => (channel.stereo === 'self' ? 1 : 0);
    return byActivity.sort((left, right) => isSelf(right) - isSelf(left));
};
