import type { DomainChannel } from '@chatic/runtime-react';

export const isChannelOwner = (channel: DomainChannel | undefined, myUid: string | null): boolean =>
    !!myUid && !!channel?.ownerId && channel.ownerId === myUid;
