import type { DomainChannel } from '@chatic/runtime';

export const isDmChannel = (channel: DomainChannel): boolean =>
    channel.stereo === 'dm' || (!channel.name && (channel.memberIds?.length ?? channel.memberNo ?? 0) === 2);

export const isSelfChannel = (channel: DomainChannel): boolean => channel.stereo === 'self';

export const dmCounterpartId = (
    channel: Pick<DomainChannel, 'memberIds'>,
    myUid: string | null,
    myCloudUid?: string | null
): string | undefined => channel.memberIds?.find(id => id !== myUid && id !== myCloudUid);
