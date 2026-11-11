import { useEffect, useState, type RefObject } from 'react';

/** Whether `ref` intersects the viewport grown by `rootMargin`. */
export const useIntersecting = (ref: RefObject<Element | null>, rootMargin: string): boolean => {
    const [intersecting, setIntersecting] = useState(false);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), { rootMargin });
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref, rootMargin]);
    return intersecting;
};
