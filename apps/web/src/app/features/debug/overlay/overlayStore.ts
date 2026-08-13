import { useSyncExternalStore } from 'react';

import type { DebugScreenKey } from './debugMenu';

/**
 * `mini` — fixed read-only observation tabs, floating.
 * `float` — a selected tool screen, floating (app underneath stays usable).
 * `expanded` — full-screen sheet with the home menu and screen stack.
 */
export type DebugOverlayMode = 'mini' | 'float' | 'expanded';

export interface DebugOverlayState {
    isOpen: boolean;
    mode: DebugOverlayMode;
    /** Expanded-mode tool screen; null renders the home menu. */
    screen: DebugScreenKey | null;
}

const INITIAL_STATE: DebugOverlayState = { isOpen: false, mode: 'mini', screen: null };

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

export const debugOverlayActions = {
    open(mode: DebugOverlayMode = 'mini') {
        setState({ isOpen: true, mode });
    },
    /** Close resets navigation so the next open starts fresh at the home menu. */
    close() {
        setState(INITIAL_STATE);
    },
    expand() {
        setState({ isOpen: true, mode: 'expanded' });
    },
    /** Keep the selected screen so re-expanding returns to where the user was. */
    minimize() {
        setState({ mode: 'mini' });
    },
    /**
     * Float the selected tool screen. Without one there is nothing to float, so this falls back to
     * the observation panel rather than opening an empty frame.
     */
    float() {
        setState({ isOpen: true, mode: state.screen ? 'float' : 'mini' });
    },
    selectScreen(screen: DebugScreenKey) {
        setState({ isOpen: true, mode: 'expanded', screen });
    },
    /** Back from a tool screen returns home; back at home closes (mobile parity). */
    goBack() {
        if (state.screen) setState({ screen: null });
        else setState(INITIAL_STATE);
    },
};

export const useDebugOverlayState = (): DebugOverlayState =>
    useSyncExternalStore(subscribeDebugOverlay, getDebugOverlayState);
