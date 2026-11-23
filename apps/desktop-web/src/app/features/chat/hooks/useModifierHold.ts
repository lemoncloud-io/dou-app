import { useEffect, useState } from 'react';

import { IS_MAC } from '../../../shared';
import { isOverlayOpen } from '../utils/keyboard';
import { type HeldModifier, MODIFIER_HOLD_MS, soleModifier } from '../utils/modifierHold';

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt']);

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
