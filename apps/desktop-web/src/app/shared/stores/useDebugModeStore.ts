import { create } from 'zustand';

import { safeLocalStorage, safeSessionStorage } from '@chatic/shared';

const STORAGE_KEY = '__dou_debug_mode';
// Overlay-open lives in sessionStorage (not local): the debug Sync page calls
// navigate(0) to hard-reload and re-read IndexedDB, so the open state must
// survive a reload — but not a full app restart, where it should start closed.
const OVERLAY_KEY = '__dou_debug_overlay';

// Storage failures (private mode, etc.) read as off and drop the write.
const readInitial = (): boolean => safeLocalStorage.getItem(STORAGE_KEY) === '1';

const persist = (enabled: boolean) => {
    if (enabled) safeLocalStorage.setItem(STORAGE_KEY, '1');
    else safeLocalStorage.removeItem(STORAGE_KEY);
};

const readOverlayInitial = (): boolean => safeSessionStorage.getItem(OVERLAY_KEY) === '1';

const persistOverlay = (open: boolean) => {
    if (open) safeSessionStorage.setItem(OVERLAY_KEY, '1');
    else safeSessionStorage.removeItem(OVERLAY_KEY);
};

interface DebugModeState {
    enabled: boolean;
    /** Whether the full-screen debug overlay is currently shown over the app. */
    overlayOpen: boolean;
    /** Flip the flag and persist it; returns the new value (for caller feedback). */
    toggle: () => boolean;
    setEnabled: (enabled: boolean) => void;
    setOverlayOpen: (open: boolean) => void;
}

/**
 * Global client state: developer debug mode. Toggled by a hidden rail gesture
 * (tap the rail divider 7×) and persisted to localStorage so it survives reloads.
 * When on, the rail exposes the Debug menu that opens the debug overlay (mounted
 * over the app even in packaged/prod builds); off hides it again.
 */
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
