import { dmPlaceOf, isCloudDm, placeOfDmId, type DomainChannel } from '@chatic/runtime-react';

export const pushRoomPlace = (
    channelId: string | null,
    pushSid: string | null,
    cached: Pick<DomainChannel, 'id' | 'sid' | 'stereo' | 'cid' | '$'> | null | undefined
): string | null => {
    if (!channelId) return pushSid;
    const own = (isCloudDm(cached) ? dmPlaceOf(cached) : '') || placeOfDmId(channelId);
    return own || pushSid;
};
