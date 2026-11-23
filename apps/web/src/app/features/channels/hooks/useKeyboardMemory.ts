import { useCallback, useEffect, useRef } from 'react';

import { KEYBOARD_MIN_PX } from '../../../ui/hooks/useKeyboardOpen';

let remembered = 0;

export const injectedLength = (name: '--keyboard-height' | '--safe-bottom'): number =>
    typeof document === 'undefined' ? 0 : parseFloat(document.documentElement.style.getPropertyValue(name)) || 0;

export const useKeyboardMemory = (onKeyboard?: (height: number) => void): (() => number) => {
    const listener = useRef(onKeyboard);
    listener.current = onKeyboard;

    useEffect(() => {
        const note = () => {
            const height = injectedLength('--keyboard-height');
            if (height >= KEYBOARD_MIN_PX) remembered = height;
            listener.current?.(height);
        };
        note();
        const observer = new MutationObserver(note);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        return () => observer.disconnect();
    }, []);

    return useCallback(() => {
        const height = injectedLength('--keyboard-height');
        if (height >= KEYBOARD_MIN_PX) remembered = height;
        return remembered;
    }, []);
};
