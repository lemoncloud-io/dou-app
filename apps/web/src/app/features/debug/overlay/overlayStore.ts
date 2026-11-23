import { useSyncExternalStore } from 'react';

import { DEBUG_PANEL_SIZES, DEBUG_SCREEN_SIZES, type DebugPanelSize, type DebugScreenKey } from './screenManifest';

export interface DebugOverlayState {
    isOpen: boolean;
    size: DebugPanelSize;
    screen: DebugScreenKey | null;
}

const INITIAL_STATE: DebugOverlayState = { isOpen: false, size: 'dock', screen: null };

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
    close() {
        setState(INITIAL_STATE);
    },
    setSize(size: DebugPanelSize) {
        setState({ isOpen: true, size });
    },
    expand() {
        debugOverlayActions.setSize(step(state.size, 1));
    },
    minimize() {
        debugOverlayActions.setSize(step(state.size, -1));
    },
    selectScreen(screen: DebugScreenKey) {
        setState({ isOpen: true, screen, size: DEBUG_SCREEN_SIZES[screen] ?? state.size });
    },
    goBack() {
        if (state.screen) setState({ screen: null });
        else setState(INITIAL_STATE);
    },
};

export const useDebugOverlayState = (): DebugOverlayState =>
    useSyncExternalStore(subscribeDebugOverlay, getDebugOverlayState);
