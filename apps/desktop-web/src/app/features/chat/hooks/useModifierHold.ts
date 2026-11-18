import { useEffect, useState } from 'react';

import { IS_MAC } from '../../../shared';
import { isOverlayOpen } from '../utils/keyboard';
import { type HeldModifier, MODIFIER_HOLD_MS, soleModifier } from '../utils/modifierHold';

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt']);

/**
 * The modifier the reader is holding down on its own, once they have held it for
 * `MODIFIER_HOLD_MS`; null otherwise.
 *
 * The wait is what keeps the hints out of the way. ⌘ goes down on every ⌘C, ⌘V and ⌘K, and a hint
 * that flashed on each would be noise; a reader who holds the key and waits is asking what it does.
 * Any other key, a click, or the window losing focus (⌘Tab) ends it, as does letting go. Nothing
 * shows over a dialog or a menu, where the app's chords do nothing either.
 */
export const useModifierHold = (): HeldModifier | null => {
    const [held, setHeld] = useState<HeldModifier | null>(null);

    useEffect(() => {
        let pending: HeldModifier | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const reset = () => {
            clearTimeout(timer);
            pending = null;
            setHeld(null);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            const modifier = soleModifier(event, IS_MAC);
            if (!modifier) {
                reset();
                return;
            }
            // A held key repeats its keydown. The wait already running is the one that counts, and a
            // repeat after a chord cancelled it is still the same press, so it starts nothing.
            if (event.repeat || modifier === pending) return;
            reset();
            pending = modifier;
            timer = setTimeout(() => {
                if (!isOverlayOpen()) setHeld(modifier);
            }, MODIFIER_HOLD_MS);
        };

        const onKeyUp = (event: KeyboardEvent) => {
            if (MODIFIER_KEYS.has(event.key)) reset();
        };

        const onHidden = () => {
            if (document.visibilityState === 'hidden') reset();
        };

        // Capture, unlike the app's other key listeners: those act on their own chord, but this one has
        // to see every key and click, including the ones a handler below stops from bubbling.
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('mousedown', reset, true);
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', onHidden);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('mousedown', reset, true);
            window.removeEventListener('blur', reset);
            document.removeEventListener('visibilitychange', onHidden);
        };
    }, []);

    return held;
};
