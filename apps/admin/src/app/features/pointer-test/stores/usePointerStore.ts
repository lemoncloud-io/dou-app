import { create } from 'zustand';

import type { ClientStatusType, RemotePointer } from '../types';

interface PointerState {
    pointers: Map<string, RemotePointer>;
}

interface PointerActions {
    setPointer: (deviceId: string, posX: number, posY: number, ts: number, tick?: number, status?: string) => void;
    removePointer: (deviceId: string) => void;
    clearPointers: () => void;
}

/**
 * Zustand store for managing remote pointer positions
 * Stores pointers by deviceId for multi-device support
 */
const store = create<PointerState & PointerActions>(set => ({
    pointers: new Map(),

    setPointer: (deviceId: string, posX: number, posY: number, ts: number, tick = 0, status = ''): void => {
        set(state => {
            const newPointers = new Map(state.pointers);
            newPointers.set(deviceId, {
                deviceId,
                posX,
                posY,
                ts,
                tick,
                status: status as ClientStatusType,
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
