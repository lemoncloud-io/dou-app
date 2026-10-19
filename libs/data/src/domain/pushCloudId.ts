import { RELAY_CLOUD_ID } from './channelScope';

/**
 * The `cid` the backend writes on a relay-origin push. It names the relay, which everything in the
 * app keys as `RELAY_CLOUD_ID`, but it is a payload marker, not a cloud id: no cache partition,
 * socket slot, session or rail tile is keyed by it, and `delegate-cloud` answers it with a 404.
 *
 * It stays `'#'` on the wire because shipped apps branch on it, and it does not become the app's id
 * because `'default'` already keys stored caches and selections — and a `#` in a link's query
 * starts the URL fragment.
 */
export const RELAY_ORIGIN_CID = '#';

/**
 * A push's `cid` as the cloud id the rest of the app keys by: the relay sentinel becomes
 * `RELAY_CLOUD_ID`, an absent or empty `cid` (deployed backends often send `""`) becomes
 * `undefined`, and any other value already is a cloud id.
 *
 * Every reader of a push's source cloud goes through here, so the sentinel is known in one place
 * and never travels past the push.
 */
export const pushCloudIdOf = (cid: unknown): string | undefined => {
    if (typeof cid !== 'string' || cid === '') return undefined;
    return cid === RELAY_ORIGIN_CID ? RELAY_CLOUD_ID : cid;
};
