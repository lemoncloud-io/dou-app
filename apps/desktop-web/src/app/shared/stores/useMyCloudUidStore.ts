import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyCloudUidState {
    /** `${cid}:${sid}` → my canonical cloud uid for that place. */
    byPlace: Record<string, string>;
    setUid: (cid: string, sid: string, uid: string) => void;
}

const keyOf = (cid: string, sid: string): string => `${cid}:${sid}`;

/**
 * My canonical cloud uid per place ({cid,sid}). webCore's `profile.uid` is the
 * ACCOUNT id, but the Display-Profile cache (and every other member) is keyed by
 * the canonical cloud id — which only `get-site-profile` returns. Persisted so a
 * relaunch resolves my own Place Profile from cache synchronously (no flash),
 * instead of waiting on an async self read every mount.
 */
export const useMyCloudUidStore = create<MyCloudUidState>()(
    persist(
        set => ({
            byPlace: {},
            setUid: (cid, sid, uid) =>
                set(state =>
                    state.byPlace[keyOf(cid, sid)] === uid
                        ? state
                        : { byPlace: { ...state.byPlace, [keyOf(cid, sid)]: uid } }
                ),
        }),
        { name: 'chatic-my-cloud-uid' }
    )
);

export const myCloudUidKey = keyOf;
