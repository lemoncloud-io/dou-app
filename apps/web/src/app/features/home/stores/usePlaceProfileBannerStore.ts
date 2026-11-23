import { create } from 'zustand';

interface PlaceProfileBannerState {
    dismissed: Record<string, true>;
    dismiss: (profileId: string) => void;
}

export const usePlaceProfileBannerStore = create<PlaceProfileBannerState>()(set => ({
    dismissed: {},
    dismiss: profileId =>
        set(state => (state.dismissed[profileId] ? state : { dismissed: { ...state.dismissed, [profileId]: true } })),
}));
