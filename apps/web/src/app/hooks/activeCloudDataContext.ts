import { createContext, useContext } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import type { ChannelUnreads } from './useChannelUnreads';

/**
 * The active cloud's channel list, my read cursors and the unread aggregation derived from both —
 * observed ONCE for the whole app.
 *
 * Three surfaces need this and each used to assemble it for itself: `UnreadBadgeRunner` (app-icon
 * `total`), `UnifiedLayout` (bottom-nav `total`) and `HomePage` (`byPlace` dots + the per-row
 * counts). The cache layer already shares the storage read between observers on the same key
 * (see BaseLocalDataSourceV2), so the duplication cost was not I/O — it was three observer
 * callbacks per channel, three `Map` rebuilds and three O(channels) aggregations on every join or
 * channel write, one of them inside the layout that wraps every route.
 *
 * `channels` is cloud-wide (every site), so a per-site view is a `filter` on it — see
 * {@link useHomeChannels}, which no longer opens a second, differently-keyed observer for the
 * active site. `byChannel` / `myJoins` are likewise cloud-wide supersets: consumers look rows up by
 * channel id, so extra keys are inert.
 *
 * What this does NOT own: the per-channel join SYNC registration. That stays scoped to the surfaces
 * that want it (home, the room) so it tears down with them — see `useJoinSyncRegistration`.
 */
export interface ActiveCloudData {
    /** Cloud-wide channel rows, minus the ones whose place the user can no longer reach. */
    channels: DomainChannel[];
    /** Whether the channel observer has answered once — `false` reads as "don't know yet". */
    isLoaded: boolean;
    /** channelId → MY join row, for the channels above. Absent = no read boundary synced yet. */
    myJoins: Map<string, DomainJoin>;
    /** Unread per channel / per place / cloud total, derived from the two above. */
    unreads: ChannelUnreads;
}

export const ActiveCloudDataContext = createContext<ActiveCloudData | null>(null);

/**
 * Read the shared observation. Throws rather than falling back to a private subscription: a silent
 * fallback would restore exactly the duplication this context exists to remove, and a silent empty
 * value would show a zero badge that never corrects itself. The provider is mounted once in
 * `AppRuntime`, above both the runners and the router, so every app surface has it.
 */
export const useActiveCloudData = (): ActiveCloudData => {
    const value = useContext(ActiveCloudDataContext);
    if (!value) {
        throw new Error('[useActiveCloudData] ActiveCloudDataProvider is missing above this component.');
    }
    return value;
};
