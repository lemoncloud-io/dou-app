import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CloudPushBadgeState {
    /** Clouds with a push received while not active — shown as a rail-tile dot. */
    badged: Record<string, true>;
    mark: (cloudId: string) => void;
    clear: (cloudId: string) => void;
}

/**
 * Per-cloud "a push arrived for this cloud" flags. The live socket only covers
 * the ACTIVE cloud, so other clouds' unread can't be counted — an FCM push
 * arriving for them is the only signal, and it must survive a relaunch (the
 * push may land while the app is closed and get replayed on boot), hence
 * persisted. Cleared when that cloud becomes the verified active one.
 */
export const useCloudPushBadgeStore = create<CloudPushBadgeState>()(
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
        { name: 'chatic-cloud-push-badges' }
    )
);
