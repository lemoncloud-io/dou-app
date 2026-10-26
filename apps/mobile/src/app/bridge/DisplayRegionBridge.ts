import { NativeEventEmitter, NativeModules } from 'react-native';

/** The division reserved region UIKit reports, in window points (its frame, margins included). */
export interface DivisionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const DIVISION_CHANGE = 'DisplayRegionDivisionChange';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The event body is `{ division: rect | null }`; anything else reads as no fold, never as a rect of NaN. */
const toDivisionRect = (payload: unknown): DivisionRect | null => {
    const division = (payload as { division?: unknown } | null)?.division;
    if (!division || typeof division !== 'object') return null;
    const { x, y, width, height } = division as Record<string, unknown>;
    return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height)
        ? { x, y, width, height }
        : null;
};

export interface IDisplayRegionBridge {
    /**
     * Calls `listener` with the active division — the fold of a device held half-open — and again
     * whenever it changes, `null` while there is none. Returns the unsubscribe.
     */
    subscribeDivision(listener: (division: DivisionRect | null) => void): () => void;
}

/**
 * The iOS `DisplayRegion` module. It asks UIKit for the window's division reserved region, which
 * only iOS 27.1 reports, and only on a foldable such as iPhone Duo.
 *
 * Silent when the module is missing, like `SharedLanguageBridge`: Android has no such module and an
 * older iOS build has none either, and in both the honest answer is "no fold", which is what the
 * listener already assumes before its first call. `start()` is called after subscribing so the
 * native side's answer for the current state lands in a live listener.
 */
export const DisplayRegionBridge: IDisplayRegionBridge = {
    subscribeDivision: listener => {
        const module = NativeModules.DisplayRegion;
        if (!module?.start) return () => undefined;

        const subscription = new NativeEventEmitter(module).addListener(DIVISION_CHANGE, payload =>
            listener(toDivisionRect(payload))
        );
        module.start();
        return () => subscription.remove();
    },
};
