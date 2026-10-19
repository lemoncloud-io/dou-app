import type { DomainChannel } from './models';

/** The relay's cloud id. Every other cloud is a subscription one. */
export const RELAY_CLOUD_ID = 'default';

/**
 * The `sid` a Self Channel is stored under when nothing names its place.
 *
 * The Self Channel belongs to the account, not to a place, and `channel.sync` / `channel.mine` send
 * it with an empty `$` (measured on dev, 2026-09-30). The cache keys every row by a place, so such a
 * row was either dropped or refused, and a new desktop user on Home — which has no place — never
 * saw the channel. It is not `''`: an empty `sid` would read as "place not known yet". A row that
 * already has a real `sid` (from `channel.get-self`, which the caller tags with its site) keeps it.
 */
export const ACCOUNT_CHANNEL_SID = '@account';

/** The `sid` the server gives a room filed under no place. */
export const NO_PLACE_SID = '#';

/**
 * The place a place-keyed 1:1 id names, or `''` when the id is not one.
 *
 * A subscription cloud keys each new 1:1 by the place it was opened in, `<sid>@<uidA>@<uidB>`, and
 * that place never changes. A room opened before that kept its pair key, `<uidA>@<uidB>`, which
 * names no place — its place comes only from the field the server sends. Only exactly three
 * non-empty parts count: `ACCOUNT_CHANNEL_SID` (`@account`) and a pair key also hold `@`.
 */
export const placeOfDmId = (id: string | null | undefined): string => {
    const parts = (id ?? '').split('@');
    return parts.length === 3 && parts.every(Boolean) ? parts[0] : '';
};

/**
 * Whether a channel is a 1:1 in a subscription cloud — the one kind whose place must never be
 * filled in from the place the reader happens to be in.
 *
 * Such a room belongs to the place the server stamped on it when it was opened, and only to that
 * place. The ambient place is a different fact: during a place switch it already names the next
 * place (the session context moves before `auth.switch` answers), and a room filed under it shows
 * in the wrong place's list. So its place is the place its id names, then the server's field, and
 * otherwise stays empty (`dmPlaceOf`). A relay 1:1 lives in the relay's one place, where the ambient
 * value is always right, so it keeps the ordinary chain.
 */
export const isCloudDm = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    !!channel && channel.stereo === 'dm' && !!channel.cid && channel.cid !== RELAY_CLOUD_ID;

/**
 * The place a 1:1 belongs to, or `''`. Never the ambient place (see `isCloudDm`).
 *
 * A place-keyed id is read first: the place it names is the one the server filed the room under,
 * and it never changes, so no field can disagree with it. Otherwise the place the server sent
 * (`sid`, then `$.sid`). The server's `#` means "no place" and reads as `''`, like an empty field.
 */
export const dmPlaceOf = (channel: Partial<Pick<DomainChannel, 'id' | 'sid' | '$'>> | null | undefined): string => {
    const fromId = placeOfDmId(channel?.id);
    if (fromId) return fromId;
    const sent = channel?.sid || channel?.$?.sid || '';
    return sent === NO_PLACE_SID ? '' : sent;
};

/**
 * Whether a channel belongs in the list for `sid`.
 *
 * Every room is listed in its own place and in no other — a group room and a 1:1 alike. A 1:1 used
 * to be read across the whole cloud instead, because the server once resolved a pair of people to
 * a single room whatever place it was opened from, so the place it carried was only where its
 * creator had been standing. The server now opens a separate 1:1 per place, so the place it
 * carries is where the conversation lives.
 */
export const isInPlaceList = (channel: Pick<DomainChannel, 'sid'>, sid: string): boolean => channel.sid === sid;
