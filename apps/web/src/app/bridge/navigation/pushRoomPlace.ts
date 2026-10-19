import { dmPlaceOf, isCloudDm, placeOfDmId, type DomainChannel } from '@chatic/data';

/**
 * The place a push opens its room in.
 *
 * A push names a place (`sid`), and for a group channel that is the room's own place. For a 1:1 it
 * is the place the sender was in when they wrote, which need not be the room's: a 1:1 belongs to the
 * place it was opened in, and the sender may be reading it from elsewhere. Switching to the push's
 * place would open the room under a place that does not list it, with that place's profiles naming
 * the people in it. So a 1:1 lands on its own place — the cached row's, else the place a place-keyed
 * id names — and only a room that names neither falls back to the push's place. A relay 1:1 lives in
 * the relay's one place and keeps the push's.
 *
 * The native shell passes the push's place on untouched (it ships through the stores, so the
 * correction lives here, where a web deploy reaches it).
 */
export const pushRoomPlace = (
    channelId: string | null,
    pushSid: string | null,
    cached: Pick<DomainChannel, 'id' | 'sid' | 'stereo' | 'cid' | '$'> | null | undefined
): string | null => {
    if (!channelId) return pushSid;
    const own = (isCloudDm(cached) ? dmPlaceOf(cached) : '') || placeOfDmId(channelId);
    return own || pushSid;
};
