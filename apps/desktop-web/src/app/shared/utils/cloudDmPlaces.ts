import { isCloudWideChannel, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';

import { dmCounterpartId, isSelfChannel } from './dmDisplay';

const isCloudSelfChannel = (channel: DomainChannel): boolean =>
    isSelfChannel(channel) && channel.cid !== RELAY_CLOUD_ID;

/**
 * The places that list each 1:1 of a subscription cloud, keyed by channel id.
 *
 * A cloud 1:1 has no place of its own: the server stamps it with the place its creator was
 * standing in, which says nothing about the other person. People are invited per place, so the
 * room belongs where its peer is — the places in which the peer shares a group channel with me.
 * There is no place member list to ask, and the place profile cache is empty for members who never
 * set a profile, so the group channels I am in are the only membership on hand. A place member who
 * shares none of them with me is therefore not seen.
 *
 * A peer found in no place still has to be reachable: the room falls back to its stamped place when
 * that place is one of mine, and to every place otherwise.
 *
 * My notes-to-self room in a subscription cloud is filed here too, under every place: the server
 * keeps one per person and returns it for any place, so filing it by the place it was created in
 * would hide it everywhere else. It is left unfiled while my places are unknown, and keeps its own
 * place until then. The relay's self room is left to its own place, as before.
 *
 * `channels` is the whole cloud's list, group channels of every place included. Order follows
 * `placeIds`.
 */
export const cloudDmPlaces = (
    channels: readonly DomainChannel[],
    { myUid, placeIds }: { myUid: string | null; placeIds: readonly string[] }
): Map<string, string[]> => {
    const mine = new Set(placeIds);
    const placesByMember = new Map<string, Set<string>>();
    for (const channel of channels) {
        if (isCloudWideChannel(channel) || !channel.sid || !mine.has(channel.sid)) continue;
        for (const memberId of channel.memberIds ?? []) {
            const places = placesByMember.get(memberId) ?? new Set<string>();
            places.add(channel.sid);
            placesByMember.set(memberId, places);
        }
    }

    const listing = new Map<string, string[]>();
    for (const channel of channels) {
        if (channel.id && isCloudSelfChannel(channel) && placeIds.length > 0) listing.set(channel.id, [...placeIds]);
        if (!channel.id || !isCloudWideChannel(channel)) continue;
        // My cloud-side id can differ from the session id, and the join row names it.
        const peerId = dmCounterpartId(channel, myUid, channel.$join?.userId);
        const shared = peerId ? placeIds.filter(id => placesByMember.get(peerId)?.has(id)) : [];
        if (shared.length > 0) listing.set(channel.id, shared);
        else if (channel.sid && mine.has(channel.sid)) listing.set(channel.id, [channel.sid]);
        else listing.set(channel.id, [...placeIds]);
    }
    return listing;
};

/**
 * The places whose list holds a channel: a group channel its own place, a cloud 1:1 the places
 * `cloudDmPlaces` gave it (none while my places are unknown), and my notes-to-self room the places it
 * was filed under — its own place when it was not filed (the relay's, or before my places load).
 */
export const listingPlaces = (
    channel: DomainChannel,
    dmPlaces: ReadonlyMap<string, readonly string[]>
): readonly string[] => {
    const filed = dmPlaces.get(channel.id ?? '');
    if (isCloudWideChannel(channel)) return filed ?? [];
    if (isSelfChannel(channel) && filed) return filed;
    return channel.sid ? [channel.sid] : [];
};
