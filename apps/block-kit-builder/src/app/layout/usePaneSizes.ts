import { useCallback, useEffect, useState } from 'react';

import { deviceStore } from '../storage';

export interface PaneSizes {
    rail: number;
    payload: number;
}

export const PANE_LIMITS = {
    rail: { min: 240, max: 460, initial: 320 },
    payload: { min: 300, max: 860, initial: 460 },
} as const;

const DEFAULTS: PaneSizes = { rail: PANE_LIMITS.rail.initial, payload: PANE_LIMITS.payload.initial };

const STORAGE_KEY = 'block-kit-builder:pane-sizes';

const isSizes = (value: unknown): value is PaneSizes =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as PaneSizes).rail === 'number' &&
    typeof (value as PaneSizes).payload === 'number';

export const usePaneSizes = () => {
    const [sizes, setSizes] = useState<PaneSizes>(DEFAULTS);

    useEffect(() => {
        try {
            const stored: unknown = JSON.parse(deviceStore.get(STORAGE_KEY) ?? 'null');
            if (isSizes(stored)) setSizes(stored);
        } catch {
            // An unreadable preference is not a reason to refuse to draw.
        }
    }, []);

    const setSize = useCallback((pane: keyof PaneSizes, value: number) => {
        setSizes(current => {
            const next = { ...current, [pane]: value };
            deviceStore.set(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    return { sizes, setSize };
};
