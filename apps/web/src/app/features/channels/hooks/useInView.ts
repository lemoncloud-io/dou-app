import { useCallback, useEffect, useState } from 'react';

/**
 * Whether the element the returned ref is put on is on screen. Where the browser has no
 * `IntersectionObserver` it is always on screen: drawing a little more is better than drawing nothing.
 */
export const useInView = (): [(element: Element | null) => void, boolean] => {
    const [element, setElement] = useState<Element | null>(null);
    const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
    const ref = useCallback((next: Element | null) => setElement(next), []);

    useEffect(() => {
        if (!element || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            const last = entries[entries.length - 1];
            if (last) setInView(last.isIntersecting);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return [ref, inView];
};
