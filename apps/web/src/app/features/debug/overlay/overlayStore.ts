import { useSyncExternalStore } from 'react';

import { DEBUG_PANEL_SIZES, DEBUG_SCREEN_SIZES, type DebugPanelSize, type DebugScreenKey } from './screenManifest';

/**
 * One panel, two sizes. `size` decides how much room the panel takes; `screen` decides what is in
 * it (null renders the home menu). Size never changes WHICH screens exist — that split is what let
 * the old `mini`/`float`/`expanded` modes grow two separate catalogs.
 *
 * `mini` and `dock` float over the app and capture pointer events only inside themselves, so the
 * app underneath stays drivable while a screen watches it. `full` covers the viewport for wide
 * content.
 */
export interface DebugOverlayState {
    isOpen: boolean;
    size: DebugPanelSize;
    screen: DebugScreenKey | null;
}

const INITIAL_STATE: DebugOverlayState = { isOpen: false, size: 'dock', screen: null };

// Module-level store (not React context) so the overlay can be opened from
// anywhere — e.g. the MyPage version tap area — and keeps working even while
// the Router renders null during boot.
let state: DebugOverlayState = INITIAL_STATE;
const listeners = new Set<() => void>();

const setState = (partial: Partial<DebugOverlayState>) => {
    state = { ...state, ...partial };
    listeners.forEach(listener => listener());
};

export const getDebugOverlayState = (): DebugOverlayState => state;

export const subscribeDebugOverlay = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const step = (size: DebugPanelSize, direction: 1 | -1): DebugPanelSize => {
    const next = DEBUG_PANEL_SIZES.indexOf(size) + direction;
    return DEBUG_PANEL_SIZES[Math.min(Math.max(next, 0), DEBUG_PANEL_SIZES.length - 1)];
};

export const debugOverlayActions = {
    open(size: DebugPanelSize = 'dock') {
        setState({ isOpen: true, size });
    },
    /** Close resets navigation so the next open starts fresh at the home menu. */
    close() {
        setState(INITIAL_STATE);
    },
    setSize(size: DebugPanelSize) {
        setState({ isOpen: true, size });
    },
    /** One step larger. Keeps the selected screen: resizing is not navigation. */
    expand() {
        debugOverlayActions.setSize(step(state.size, 1));
    },
    /** One step smaller, down to the corner widget. */
    minimize() {
        debugOverlayActions.setSize(step(state.size, -1));
    },
    /**
     * Open a screen. The manifest may demand a size (content that cannot be read in the dock);
     * otherwise the panel keeps the size it already has, so switching screens never resizes under
     * the user.
     */
    selectScreen(screen: DebugScreenKey) {
        setState({ isOpen: true, screen, size: DEBUG_SCREEN_SIZES[screen] ?? state.size });
    },
    /** Back from a screen returns home; back at home closes (mobile parity). */
    goBack() {
        if (state.screen) setState({ screen: null });
        else setState(INITIAL_STATE);
    },
};

export const useDebugOverlayState = (): DebugOverlayState =>
    useSyncExternalStore(subscribeDebugOverlay, getDebugOverlayState);
