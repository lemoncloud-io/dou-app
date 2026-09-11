import type { DomainChannel } from '@chatic/data';

import { isDmChannel, isSelfChannel } from '../../../shared';

/**
 * Sidebar grouping predicate: DM and self rows share the DM section, the DM
 * unread shape and the reduced context menu (no rename / members / delete).
 * One definition — ChannelList's split and ChannelRowMenu's gating must not
 * drift apart.
 */
export const isDmBucket = (channel: DomainChannel): boolean => isDmChannel(channel) || isSelfChannel(channel);
