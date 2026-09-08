import { useCallback, useEffect, useState } from 'react';

/** How wide the two sized panes are. The message pane takes what is left. */
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

/**
 * The widths the reader dragged the panes to, remembered.
 *
 * Persisted because the choice outlives the session that made it: someone who
 * widened the editor to read a pasted payload is reading payloads, and asking
 * them to drag it back every visit is asking them to re-answer a question they
 * already answered.
 *
 * Read once at mount rather than in the initialiser. The layout has a correct
 * default and storage can be unreadable — a locked-down browser, a private
 * window — so a first paint at the default that settles into the saved width is
 * the honest failure mode. The alternative is a builder that will not draw
 * because it could not remember a number.
 */
export const usePaneSizes = () => {
    const [sizes, setSizes] = useState<PaneSizes>(DEFAULTS);

    useEffect(() => {
        try {
            const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
            if (isSizes(stored)) setSizes(stored);
        } catch {
            // An unreadable preference is not a reason to refuse to draw.
        }
    }, []);

    const setSize = useCallback((pane: keyof PaneSizes, value: number) => {
        setSizes(current => {
            const next = { ...current, [pane]: value };
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Storage full or blocked. The drag still works for this session.
            }
            return next;
        });
    }, []);

    return { sizes, setSize };
};
