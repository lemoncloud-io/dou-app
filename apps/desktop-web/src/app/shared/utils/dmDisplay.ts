import type { DomainChannel } from '@chatic/data';

/** A 1:1 conversation: stereo 'dm', or an unnamed 2-member private channel. */
export const isDmChannel = (channel: DomainChannel): boolean =>
    channel.stereo === 'dm' || (!channel.name && (channel.memberIds?.length ?? channel.memberNo ?? 0) === 2);

/** My notes-to-self channel (e.g. the Default Cloud's Self Channel). */
export const isSelfChannel = (channel: DomainChannel): boolean => channel.stereo === 'self';

/** The other party's id in a DM — either of my ids (account/cloud) is "me". */
export const dmCounterpartId = (
    channel: DomainChannel,
    myUid: string | null,
    myCloudUid?: string | null
): string | undefined => channel.memberIds?.find(id => id !== myUid && id !== myCloudUid);
