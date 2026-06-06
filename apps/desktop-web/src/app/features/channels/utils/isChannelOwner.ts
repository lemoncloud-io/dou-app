import type { DomainChannel } from '@chatic/data';

/**
 * True when `myUid` is the owner of `channel`. Single source for the owner
 * gating that drives Rename/Delete/Kick visibility across the channel UI.
 */
export const isChannelOwner = (channel: DomainChannel | undefined, myUid: string | null): boolean =>
    !!myUid && !!channel?.ownerId && channel.ownerId === myUid;
