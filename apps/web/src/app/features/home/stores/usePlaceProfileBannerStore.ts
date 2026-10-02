import { create } from 'zustand';

interface PlaceProfileBannerState {
    /** Profile ids (`${sid}@${uid}`) whose banner was closed in this run of the app. */
    dismissed: Record<string, true>;
    dismiss: (profileId: string) => void;
}

/**
 * Which places' profile banners were closed. In memory on purpose, not persisted: closing means
 * "not now", and the next launch asks again for as long as the profile is still missing. A
 * persisted dismissal would turn the banner into a one-time notice, which leaves exactly the people
 * it exists for without a name. A store rather than component state so that leaving home for a room
 * and coming back does not bring a closed banner back.
 */
export const usePlaceProfileBannerStore = create<PlaceProfileBannerState>()(set => ({
    dismissed: {},
    dismiss: profileId =>
        set(state => (state.dismissed[profileId] ? state : { dismissed: { ...state.dismissed, [profileId]: true } })),
}));
