import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

const RECENT_LIMIT = 12;

interface LastChannelState {
    byScope: Record<string, string>;
    placeByCloud: Record<string, string>;
    recent: string[];
    remember: (scope: string, channelId: string) => void;
    rememberPlace: (cloudId: string, placeId: string) => void;
}

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
        { name: 'chatic-last-channel', storage: persistStorageOver(deviceStore) }
    )
);
