import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoriteChannelsState {
    /** Starred channel ids (channels and DMs alike). Device-local — the server keeps no favorites. */
    ids: Record<string, true>;
    toggle: (channelId: string) => void;
}

/**
 * The sidebar's Favorites section (Figma "즐겨찾기") and the header star. There is no
 * server-side favorite, so this lives on the device like Saved items, and logout clears it
 * with the other account-scoped stores (`useAccountResetOnLogout`).
 */
export const useFavoriteChannelsStore = create<FavoriteChannelsState>()(
    persist(
        set => ({
            ids: {},
            toggle: channelId =>
                set(state => {
                    if (!state.ids[channelId]) return { ids: { ...state.ids, [channelId]: true } };
                    const { [channelId]: _removed, ...rest } = state.ids;
                    return { ids: rest };
                }),
        }),
        { name: 'chatic-favorite-channels' }
    )
);
