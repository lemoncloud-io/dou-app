import type { DomainChannel } from '@chatic/data';

import { isDmChannel, isSelfChannel } from '../../../shared';

/**
 * Sidebar grouping predicate: DM and self rows share the DM section, the DM
 * unread shape and the reduced context menu (no rename / members / delete).
 * One definition — ChannelList's split and ChannelRowMenu's gating must not
 * drift apart.
 */
export const isDmBucket = (channel: DomainChannel): boolean => isDmChannel(channel) || isSelfChannel(channel);

/** Whether a channel, not a DM or the notes-to-self room, holds unread messages: the Channels tile's dot. */
export const hasUnreadRoom = (channels: DomainChannel[]): boolean =>
    channels.some(channel => !isDmBucket(channel) && (channel.unreadCount ?? 0) > 0);

/** Whether a 1:1 or the notes-to-self room holds unread messages: the DM tile's dot. */
export const hasUnreadDm = (channels: DomainChannel[]): boolean =>
    channels.some(channel => isDmBucket(channel) && (channel.unreadCount ?? 0) > 0);
