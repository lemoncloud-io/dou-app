import { RELAY_CLOUD_ID } from '@chatic/data';

import type { CachedCloudTokens } from '../session/store/cloudStore';
import { cloudStore } from '../session/store/stores';

/**
 * Which clouds keep a socket session while the user is not looking at them — the policy half of
 * background slots, and the one place both its writers and its readers meet.
 *
 * The app decides WHICH clouds the user belongs to (it owns the catalog and the invited-cloud cache)
 * and hands the list over with `connection.useBackgroundClouds`. The runtime decides how many of
 * them get a socket, and in what order: `selectBackgroundClouds` below. Keeping the list and the
 * policy apart is what lets four apps share one policy while each assembles membership its own way.
 *
 * A plain module store rather than a session signal: the list is app input, not session state, and
 * the session's signal kinds are a closed set. The version also moves when a cloud's cached tokens
 * appear or go (`invalidate`), because the per-cloud token cache announces nothing on its own and
 * the slots are derived from it.
 */

/**
 * How many clouds, besides the committed one, keep a socket session. Five is the largest
 * subscription tier's allowance of owned clouds, so an account that only owns clouds never reaches
 * it; invited clouds are bounded by no plan, and past five in total the ones entered most recently
 * are kept. Each background session costs one socket and a token
 * re-issue per lifetime (two HTTP calls), so the cap is what bounds that cost per device.
 */
export const MAX_BACKGROUND_CLOUDS = 5;

export interface BackgroundCloudInputs {
    /** The clouds the account belongs to, as the app assembled them. Order is the tie-break. */
    joined: readonly string[];
    /** Clouds entered, most recent first (`cloudStore.getRecentClouds`). */
    recent: readonly string[];
    /** The committed cloud — it has its own slot, so it is never a background one. */
    committed: string | null;
    /**
     * Clouds a write in flight is addressed to (`backgroundClouds.hold`) whose slot is bound. They
     * are kept whatever the cap and the joined list say, because tearing their slot down would end
     * the write.
     */
    held?: readonly string[];
    max?: number;
}

/**
 * The clouds that get a background slot: every joined cloud except the relay and the committed one,
 * most recently entered first, then in the app's order, capped — and after them every held cloud the
 * cap left out. Deterministic for the same inputs, which is what keeps a re-render from reshuffling
 * which clouds hold a socket.
 *
 * A held cloud sits outside the cap rather than taking a place inside it: a hold lasts one write, and
 * letting it displace a joined cloud would tear that cloud's slot down for the length of a send.
 */
export const selectBackgroundClouds = ({
    joined,
    recent,
    committed,
    held = [],
    max = MAX_BACKGROUND_CLOUDS,
}: BackgroundCloudInputs): string[] => {
    const isBackground = (cid: string): boolean => !!cid && cid !== RELAY_CLOUD_ID && cid !== committed;
    const eligible = new Set(joined.filter(isBackground));
    const ordered = [...recent.filter(cid => eligible.has(cid)), ...eligible];
    const capped = [...new Set(ordered)].slice(0, Math.max(0, max));
    return [...new Set([...capped, ...held.filter(isBackground)])];
};

/**
 * The cached entry a background slot for `cid` would authenticate with, when it is complete enough
 * to: a `wss` to connect to and an identity token to register. Both the slot derivation and
 * `logoutCloudSession`'s "will this cloud be kept" ask it, so the two cannot disagree.
 */
export const usableBackgroundEntryOf = (cid: string): CachedCloudTokens | null => {
    const entry = cloudStore.peekCachedCloudTokens(cid);
    return entry?.delegationToken?.wss && entry.cloudToken?.Token?.identityToken ? entry : null;
};

/**
 * Whether dropping `cid`'s slot would end a session the account still has: the cloud is still in the
 * app's list and its cached tokens are still good to sign with. That is the one case in which a slot
 * going away should tell its server `auth.logout` — the cloud was pushed past the cap, not left. A
 * cloud the account is no longer in, or whose session already expired, has nothing to sign off from.
 *
 * `SocketBinder` asks it for every cloud slot it tears down, and `logoutCloudSession` asks the
 * opposite, so exactly one of the two notifies a cloud the user walks out of.
 */
export const hasLiveJoinedSession = (cid: string): boolean =>
    joined.includes(cid) && usableBackgroundEntryOf(cid) != null;

type Listener = () => void;

let joined: readonly string[] = [];
let version = 0;
const expired = new Set<string>();
// Reference counts, not a set: two sends to the same cloud overlap, and the first to settle must not
// release the slot the second is still waiting on.
const holds = new Map<string, number>();
const listeners = new Set<Listener>();

const notify = (): void => {
    version += 1;
    for (const listener of [...listeners]) listener();
};

/** Same members in the same order — the app hands a fresh array on every render. */
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((cid, index) => cid === b[index]);

export const backgroundClouds = {
    /**
     * The app's list of the clouds the account belongs to. One writer: `useBackgroundClouds`, mounted
     * once per app. A second mount would overwrite the first's list, and its unmount would clear it.
     */
    setJoined(cids: readonly string[]): void {
        if (sameList(joined, cids)) return;
        joined = [...cids];
        notify();
    },
    getJoined(): readonly string[] {
        return joined;
    },
    /**
     * Something the slots are derived from moved outside any signal — a cloud's cached tokens were
     * issued or dropped. Re-derives the slots.
     */
    invalidate(): void {
        notify();
    },
    /**
     * `cid`'s socket session expired terminally and its cached tokens were dropped. The token
     * preparer backs off before issuing that cloud new ones, instead of re-booting it into the same
     * expiry at once. Re-derives the slots.
     */
    noteExpired(cid: string): void {
        expired.add(cid);
        notify();
    },
    /**
     * Keeps `cid`'s slot bound until the returned release is called — for a write addressed to that
     * cloud, so a switch away from it, or its falling past the cap, cannot end the write in flight.
     * It keeps a slot that is bound and opens none (see `currentBackgroundSelection`). Released as
     * soon as the write settles: its ack is all that needs the socket, and a second write takes its
     * own hold. Calling the release twice releases once.
     */
    hold(cid: string): () => void {
        holds.set(cid, (holds.get(cid) ?? 0) + 1);
        if (holds.get(cid) === 1) notify();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const count = (holds.get(cid) ?? 1) - 1;
            if (count > 0) {
                holds.set(cid, count);
                return;
            }
            holds.delete(cid);
            notify();
        };
    },
    /** The clouds held right now, in the order they were first held. */
    getHeld(): readonly string[] {
        return [...holds.keys()];
    },
    /** Whether `cid` expired since the last ask; answering clears it. */
    takeExpired(cid: string): boolean {
        return expired.delete(cid);
    },
    /** For `useSyncExternalStore`: moves on every change above. */
    getVersion(): number {
        return version;
    },
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

/** Test seam: the store is a process singleton. */
export const resetBackgroundClouds = (): void => {
    joined = [];
    version = 0;
    expired.clear();
    holds.clear();
    listeners.clear();
};
