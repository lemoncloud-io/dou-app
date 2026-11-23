import { create } from 'zustand';

interface ChannelSyncMarkState {
    synced: Record<string, true>;
    markSynced: (cid: string, uid: string | undefined) => void;
}

const scopeKey = (cid: string, uid: string | undefined): string => `${cid}:${uid ?? ''}`;

export const useChannelSyncMarkStore = create<ChannelSyncMarkState>(set => ({
    synced: {},
    markSynced: (cid, uid) =>
        set(state => {
            const key = scopeKey(cid, uid);
            return state.synced[key] ? state : { synced: { ...state.synced, [key]: true } };
        }),
}));

export const useHasChannelSync = (cid: string, uid: string | undefined): boolean =>
    useChannelSyncMarkStore(state => !!state.synced[scopeKey(cid, uid)]);
