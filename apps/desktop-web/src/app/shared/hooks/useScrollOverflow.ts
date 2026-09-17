import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether a scroll box has content hidden above or below its viewport. The rails
 * scroll with no scrollbar, so at a short window (or 200% zoom) whole tiles sat
 * out of sight with nothing hinting they existed.
 */
export const useScrollOverflow = <T extends HTMLElement>() => {
    const ref = useRef<T | null>(null);
    const [overflow, setOverflow] = useState({ above: false, below: false });

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const above = el.scrollTop > 1;
        const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        setOverflow(prev => (prev.above === above && prev.below === below ? prev : { above, below }));
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        measure();
        el.addEventListener('scroll', measure, { passive: true });
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(el);
        // Tiles arriving later change the content height without resizing the box.
        const mutations = new MutationObserver(measure);
        mutations.observe(el, { childList: true });
        return () => {
            el.removeEventListener('scroll', measure);
            observer?.disconnect();
            mutations.disconnect();
        };
    }, [measure]);

    return { ref, ...overflow };
};
