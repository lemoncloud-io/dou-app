import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

interface CloudPushBadgeState {
    badged: Record<string, true>;
    mark: (cloudId: string) => void;
    clear: (cloudId: string) => void;
}

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
        { name: 'chatic-cloud-push-badges', storage: persistStorageOver(deviceStore) }
    )
);
