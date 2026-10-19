import { RELAY_CLOUD_ID } from '@chatic/data';

/**
 * The `cid` the backend writes on a relay-origin push. It names the relay — the rail's Home tile,
 * `RELAY_CLOUD_ID` (`'default'`) — but it is a payload marker, not a cloud id: no tile, cache
 * partition or session is keyed by it, and `delegate-cloud` answers it with a 404.
 */
export const RELAY_ORIGIN_CID = '#';

/**
 * A push's `cid` as the cloud id the rest of the app keys by: the relay sentinel becomes
 * `RELAY_CLOUD_ID`, an absent or empty `cid` (the deployed backends often send `""`) becomes
 * `undefined`, and any other value is already a cloud id. Every reader of a push's source cloud
 * goes through here, so the sentinel never travels past the push.
 */
export const pushCloudIdOf = (cid: unknown): string | undefined => {
    if (typeof cid !== 'string' || cid === '') return undefined;
    return cid === RELAY_ORIGIN_CID ? RELAY_CLOUD_ID : cid;
};
