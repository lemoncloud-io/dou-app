import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CloudPushMarkState {
    /** Clouds with a push received while not active — shown as a dot (ADR-0056). */
    badged: Record<string, true>;
    mark: (cloudId: string) => void;
    clear: (cloudId: string) => void;
}

/**
 * Ported from apps/desktop-web `useCloudPushBadgeStore` (ADR-0056) — a boolean presence set, not a
 * count. `mark`/`clear` return the same state reference on a no-op so consumers reading `badged`
 * don't re-render for a mark that was already there (or already gone).
 */
export const useCloudPushMarkStore = create<CloudPushMarkState>()(
    persist(
        set => ({
            badged: {},
            mark: cloudId =>
                set(state => (state.badged[cloudId] ? state : { badged: { ...state.badged, [cloudId]: true } })),
            clear: cloudId =>
                set(state => {
                    if (!state.badged[cloudId]) return state;
                    const { [cloudId]: _cleared, ...rest } = state.badged;
                    return { badged: rest };
                }),
        }),
        { name: 'chatic.push.cloud-marks' }
    )
);
