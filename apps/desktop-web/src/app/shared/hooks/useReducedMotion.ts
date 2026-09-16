import { useEffect, useState } from 'react';

/**
 * Whether the viewer asked for reduced motion.
 *
 * `styles.css` zeroes CSS durations and `scroll-behavior` globally, and that was
 * treated as full coverage — so every JS-driven scroll added since slipped
 * through: a `scrollIntoView({ behavior: 'smooth' })` argument overrides the
 * stylesheet, and a requestAnimationFrame loop never consults it at all. This is
 * the JS half of the same preference.
 */
export const useReducedMotion = (): boolean => {
    const [reduced, setReduced] = useState(
        () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    );
    useEffect(() => {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query) return;
        const onChange = () => setReduced(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return reduced;
};
