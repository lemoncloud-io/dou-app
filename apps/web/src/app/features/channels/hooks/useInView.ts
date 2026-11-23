import { useCallback, useEffect, useState } from 'react';

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
