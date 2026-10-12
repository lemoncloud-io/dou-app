import { useCallback, useEffect, useRef } from 'react';

import { KEYBOARD_MIN_PX } from '../../../ui/hooks/useKeyboardOpen';

/**
 * The last keyboard height the native shell reported, for the rest of the page's life. One keyboard
 * per device, so a height seen in one room is the right guess in the next.
 */
let remembered = 0;

/**
 * A length the native shell injects on the document root (`getSafeAreaScript`), in px; 0 where it is
 * absent — a browser — or not a number. Read off the root's own inline style, which is where the shell
 * writes it: unlike a computed read, it costs no style recalculation, and it runs on every write to the
 * root's style.
 */
export const injectedLength = (name: '--keyboard-height' | '--safe-bottom'): number =>
    typeof document === 'undefined' ? 0 : parseFloat(document.documentElement.style.getPropertyValue(name)) || 0;

/**
 * Remembers the software keyboard's height, so the attach panel can take the keyboard's place at the
 * keyboard's own height and switching between the two does not move the composer.
 *
 * The native shell injects `--keyboard-height` on the document root and fires no event for it, so the
 * root's `style` attribute is watched instead: every injection is a write to it. Only a height that
 * counts as a keyboard (`KEYBOARD_MIN_PX`) is kept — a closing keyboard reports 0, and the last real
 * one is what the panel wants. A browser injects nothing, and nothing is remembered there.
 *
 * `onKeyboard` hears every height noticed, 0 included. It is read through a ref, so it may be a new
 * function on every render. Returns a stable reader of the remembered height (0 until one is seen).
 */
export const useKeyboardMemory = (onKeyboard?: (height: number) => void): (() => number) => {
    const listener = useRef(onKeyboard);
    listener.current = onKeyboard;

    useEffect(() => {
        const note = () => {
            const height = injectedLength('--keyboard-height');
            if (height >= KEYBOARD_MIN_PX) remembered = height;
            listener.current?.(height);
        };
        // A keyboard already up when the screen mounts was injected before anything could watch.
        note();
        const observer = new MutationObserver(note);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        return () => observer.disconnect();
    }, []);

    return useCallback(() => {
        // Read once more at the ask: the observer's callback runs a microtask after the write.
        const height = injectedLength('--keyboard-height');
        if (height >= KEYBOARD_MIN_PX) remembered = height;
        return remembered;
    }, []);
};
