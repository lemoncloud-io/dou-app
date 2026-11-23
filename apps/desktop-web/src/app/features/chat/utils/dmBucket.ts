import type { DomainChannel } from '@chatic/runtime';

import { isDmChannel, isSelfChannel } from '../../../shared';

export const isDmBucket = (channel: DomainChannel): boolean => isDmChannel(channel) || isSelfChannel(channel);

export const hasUnreadRoom = (channels: DomainChannel[]): boolean =>
    channels.some(channel => !isDmBucket(channel) && (channel.unreadCount ?? 0) > 0);

export const hasUnreadDm = (channels: DomainChannel[]): boolean =>
    channels.some(channel => isDmBucket(channel) && (channel.unreadCount ?? 0) > 0);
