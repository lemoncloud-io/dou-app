import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How many recently opened channels the quick switcher can offer. */
const RECENT_LIMIT = 12;

interface LastChannelState {
    /** Last selected channel id per `cid:placeId` scope, to restore it when you return. */
    byScope: Record<string, string>;
    /** Last selected place per cloud, to restore it when you switch back to that cloud. */
    placeByCloud: Record<string, string>;
    /** Recently opened channel ids, most recent first, across every scope. */
    recent: string[];
    remember: (scope: string, channelId: string) => void;
    rememberPlace: (cloudId: string, placeId: string) => void;
}

/**
 * Remembers where you were in each cloud and place, so switching away and back
 * restores it instead of snapping to the first entry. Persisted: in memory only,
 * a restart kept the one open channel and sent every other place back to its
 * first channel. Account-scoped — cleared on logout via useAccountResetOnLogout.
 *
 * - `byScope` — the channel, keyed by `cid:placeId` because place ids (sid)
 *   collide across clouds.
 * - `placeByCloud` — the place. Only the channel-within-place used to be kept, so
 *   returning to a cloud always landed on its first place, and the remembered
 *   channel of the place you had actually left was never consulted.
 * - `recent` — the order you opened channels in. The quick switcher's empty state
 *   listed an arbitrary first eight; recents are what a person reaches for.
 */
export const useLastChannelStore = create<LastChannelState>()(
    persist(
        set => ({
            byScope: {},
            placeByCloud: {},
            recent: [],
            remember: (scope, channelId) =>
                set(state => {
                    const recent =
                        state.recent[0] === channelId
                            ? state.recent
                            : [channelId, ...state.recent.filter(id => id !== channelId)].slice(0, RECENT_LIMIT);
                    if (state.byScope[scope] === channelId && recent === state.recent) return state;
                    return { byScope: { ...state.byScope, [scope]: channelId }, recent };
                }),
            rememberPlace: (cloudId, placeId) =>
                set(state =>
                    state.placeByCloud[cloudId] === placeId
                        ? state
                        : { placeByCloud: { ...state.placeByCloud, [cloudId]: placeId } }
                ),
        }),
        { name: 'chatic-last-channel' }
    )
);
