import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../../storage';

interface CloudPushMarkState {
    badged: Record<string, true>;
    mark: (cloudId: string) => void;
    clear: (cloudId: string) => void;
}

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
        { name: 'chatic.push.cloud-marks', storage: persistStorageOver(deviceStore) }
    )
);
