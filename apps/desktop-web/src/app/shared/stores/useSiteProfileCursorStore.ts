import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SiteProfileCursorState {
    /** `${cid}:${sid}` → last server `syncedAt`, sent as the next sync `since`. */
    cursors: Record<string, number>;
    getCursor: (cid: string, sid: string) => number;
    setCursor: (cid: string, sid: string, syncedAt: number) => void;
}

const keyOf = (cid: string, sid: string): string => `${cid}:${sid}`;

/**
 * Per-place ({cid,sid}) Place-Profile sync watermark. Server-issued `syncedAt`,
 * persisted so a relaunch resumes the delta instead of refetching the full set.
 * Never the client clock (ADR 0007).
 */
export const useSiteProfileCursorStore = create<SiteProfileCursorState>()(
    persist(
        (set, get) => ({
            cursors: {},
            getCursor: (cid, sid) => get().cursors[keyOf(cid, sid)] ?? 0,
            setCursor: (cid, sid, syncedAt) =>
                set(state => ({ cursors: { ...state.cursors, [keyOf(cid, sid)]: syncedAt } })),
        }),
        { name: 'chatic-site-profile-cursor' }
    )
);
