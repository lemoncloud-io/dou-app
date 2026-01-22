import { create } from 'zustand';

import type { RemotePointer } from '../types';

interface PointerState {
    pointers: Map<string, RemotePointer>;
}

interface PointerActions {
    setPointer: (deviceId: string, posX: number, posY: number, ts: number) => void;
    removePointer: (deviceId: string) => void;
    clearPointers: () => void;
}

/**
 * Zustand store for managing remote pointer positions
 * Stores pointers by deviceId for multi-device support
 */
const store = create<PointerState & PointerActions>(set => ({
    pointers: new Map(),

    setPointer: (deviceId: string, posX: number, posY: number, ts: number): void => {
        set(state => {
            const newPointers = new Map(state.pointers);
            newPointers.set(deviceId, {
                deviceId,
                posX,
                posY,
                ts,
                lastUpdated: Date.now(),
            });
            return { pointers: newPointers };
        });
    },

    removePointer: (deviceId: string): void => {
        set(state => {
            const newPointers = new Map(state.pointers);
            newPointers.delete(deviceId);
            return { pointers: newPointers };
        });
    },

    clearPointers: (): void => {
        set({ pointers: new Map() });
    },
}));

// Expose store in development for testing
if (import.meta.env.DEV) {
    (window as Window & { __POINTER_STORE__?: typeof store }).__POINTER_STORE__ = store;
}

export const usePointerStore = store;
