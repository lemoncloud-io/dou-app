import { create } from 'zustand';

const STORAGE_KEY = '__dou_debug_mode';

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

interface DebugModeState {
    enabled: boolean;
    /** Flip the flag and persist it; returns the new value (for caller feedback). */
    toggle: () => boolean;
    setEnabled: (enabled: boolean) => void;
}

/**
 * Global client state: developer debug mode. Toggled by a hidden rail gesture
 * (tap the rail divider 7×) and persisted to localStorage so it survives reloads.
 * When on, the rail exposes the Debug menu and the /debug/* routes are mounted
 * even in packaged/prod builds; off hides them again.
 */
export const useDebugModeStore = create<DebugModeState>((set, get) => ({
    enabled: readInitial(),
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
}));
