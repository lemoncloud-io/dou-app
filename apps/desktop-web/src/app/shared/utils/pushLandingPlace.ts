import { dmPlaceOf, placeOfDmId, RELAY_CLOUD_ID } from '@chatic/runtime-react';

import type { PushChannelData } from './resolvePushCloudId';

export const pushLandingPlace = (
    push: { channelId?: string; sid?: string },
    cachedChannel: PushChannelData | null | undefined,
    cloudId: string | null
): string => {
    const isCloudRoom = cachedChannel?.stereo === 'dm' && !!cloudId && cloudId !== RELAY_CLOUD_ID;
    const own = (isCloudRoom ? dmPlaceOf(cachedChannel) : '') || placeOfDmId(push.channelId);
    return own || push.sid || '';
};
