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
    max?: number;
}

/**
 * The clouds that get a background slot: every joined cloud except the relay and the committed one,
 * most recently entered first, then in the app's order, capped. Deterministic for the same inputs,
 * which is what keeps a re-render from reshuffling which clouds hold a socket.
 */
export const selectBackgroundClouds = ({
    joined,
    recent,
    committed,
    max = MAX_BACKGROUND_CLOUDS,
}: BackgroundCloudInputs): string[] => {
    const eligible = new Set(joined.filter(cid => !!cid && cid !== RELAY_CLOUD_ID && cid !== committed));
    const ordered = [...recent.filter(cid => eligible.has(cid)), ...eligible];
    return [...new Set(ordered)].slice(0, Math.max(0, max));
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

type Listener = () => void;

let joined: readonly string[] = [];
let version = 0;
const expired = new Set<string>();
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
    listeners.clear();
};
