import { create } from 'zustand';
import { deviceStore, tabStore } from '../../storage';

const STORAGE_KEY = '__dou_debug_mode';
const OVERLAY_KEY = '__dou_debug_overlay';

const readInitial = (): boolean => deviceStore.get(STORAGE_KEY) === '1';

const persist = (enabled: boolean) => {
    if (enabled) deviceStore.set(STORAGE_KEY, '1');
    else deviceStore.remove(STORAGE_KEY);
};

const readOverlayInitial = (): boolean => tabStore.get(OVERLAY_KEY) === '1';

const persistOverlay = (open: boolean) => {
    if (open) tabStore.set(OVERLAY_KEY, '1');
    else tabStore.remove(OVERLAY_KEY);
};

interface DebugModeState {
    enabled: boolean;
    overlayOpen: boolean;
    toggle: () => boolean;
    setEnabled: (enabled: boolean) => void;
    setOverlayOpen: (open: boolean) => void;
}

export const useDebugModeStore = create<DebugModeState>((set, get) => ({
    enabled: readInitial(),
    overlayOpen: readOverlayInitial(),
    toggle: () => {
        const next = !get().enabled;
        persist(next);
        set({ enabled: next });
        return next;
    },
    setEnabled: enabled => {
        persist(enabled);
        set({ enabled });
    },
    setOverlayOpen: open => {
        persistOverlay(open);
        set({ overlayOpen: open });
    },
}));
