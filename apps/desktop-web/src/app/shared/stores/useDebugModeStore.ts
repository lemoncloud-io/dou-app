import { create } from 'zustand';

const STORAGE_KEY = '__dou_debug_mode';
// Overlay-open lives in sessionStorage (not local): the debug Sync page calls
// navigate(0) to hard-reload and re-read IndexedDB, so the open state must
// survive a reload — but not a full app restart, where it should start closed.
const OVERLAY_KEY = '__dou_debug_overlay';

const readInitial = (): boolean => {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

const persist = (enabled: boolean) => {
    try {
        if (enabled) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore storage failures (private mode, etc.)
    }
};

const readOverlayInitial = (): boolean => {
    try {
        return sessionStorage.getItem(OVERLAY_KEY) === '1';
    } catch {
        return false;
    }
};

const persistOverlay = (open: boolean) => {
    try {
        if (open) sessionStorage.setItem(OVERLAY_KEY, '1');
        else sessionStorage.removeItem(OVERLAY_KEY);
    } catch {
        // ignore storage failures (private mode, etc.)
    }
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
