import { create } from 'zustand';

/**
 * Which clouds have had their channel delta answered by the server at least once this app session.
 *
 * The chat section renders off a cache that answers an unvisited cloud instantly, with nothing, so
 * "the cache emitted" is not an answer about the cloud — see `useColdListWindow` for the ambiguity
 * and the bound on waiting it out. This store is the fast way out of that wait for the case it
 * matters most: a place with genuinely no rooms is COMMON (every place starts that way), and making
 * it sit through the whole window before saying so would be its own bug.
 *
 * `useBackgroundSync` owns list discovery, so it is the one place that knows a delta was asked for
 * and answered — including a failed one, which is still an answer about reachability rather than
 * about the cloud. The place list gets no equivalent mark on purpose: `PlaceRepository` treats an
 * empty snapshot as untrustworthy and discards it without writing, so a completed `refreshList`
 * cannot testify that a cloud has no places. There, rows arriving or the window elapsing is the
 * whole signal.
 *
 * Keyed by {cid, uid} — the same scope the channel observer subscribes under, so a second account
 * signing in during the same session waits for its own answer instead of inheriting this one's.
 *
 * Not persisted: it records this app session's network history, not the device's.
 */
interface ChannelSyncMarkState {
    /** `${cid}:${uid}` → answered. Absent reads as "not asked yet". */
    synced: Record<string, true>;
    markSynced: (cid: string, uid: string | undefined) => void;
}

const scopeKey = (cid: string, uid: string | undefined): string => `${cid}:${uid ?? ''}`;

export const useChannelSyncMarkStore = create<ChannelSyncMarkState>(set => ({
    synced: {},
    markSynced: (cid, uid) =>
        set(state => {
            const key = scopeKey(cid, uid);
            // Re-marking the same scope is the common case — every poll tick and every foreground
            // return passes through here. Returning the previous state keeps the object identity
            // stable so no subscriber re-renders for a mark that changed nothing.
            return state.synced[key] ? state : { synced: { ...state.synced, [key]: true } };
        }),
}));

/** Whether this cloud's channel delta has been answered (or has failed) at least once. */
export const useHasChannelSync = (cid: string, uid: string | undefined): boolean =>
    useChannelSyncMarkStore(state => !!state.synced[scopeKey(cid, uid)]);
