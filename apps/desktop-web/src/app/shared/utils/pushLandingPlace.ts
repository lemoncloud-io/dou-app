import { dmPlaceOf, placeOfDmId, RELAY_CLOUD_ID } from '@chatic/data';

import type { PushChannelData } from './resolvePushCloudId';

/**
 * The place a notification opens its room in.
 *
 * A push names a place (`sid`), and for a group channel that is the room's own place. For a 1:1 it is
 * the place the sender was in when they wrote, which need not be the room's: a 1:1 belongs to the
 * place it was opened in, and the sender may be reading it from elsewhere. So a 1:1 lands on its own
 * place — the cached row's, else the place a place-keyed id names — and only a room that names
 * neither falls back to the push's place. A relay 1:1 lives in the relay's one place and keeps the
 * push's; `cloudId` is the push's source cloud (`null` when it could not be resolved).
 */
export const pushLandingPlace = (
    push: { channelId?: string; sid?: string },
    cachedChannel: PushChannelData | null | undefined,
    cloudId: string | null
): string => {
    const isCloudRoom = cachedChannel?.stereo === 'dm' && !!cloudId && cloudId !== RELAY_CLOUD_ID;
    const own = (isCloudRoom ? dmPlaceOf(cachedChannel) : '') || placeOfDmId(push.channelId);
    return own || push.sid || '';
};
