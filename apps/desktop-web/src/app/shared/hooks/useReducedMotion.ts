import { useMediaQuery } from './useMediaQuery';

/**
 * Whether the viewer asked for reduced motion.
 *
 * `styles.css` zeroes CSS durations and `scroll-behavior` globally, and that was
 * treated as full coverage — so every JS-driven scroll added since slipped
 * through: a `scrollIntoView({ behavior: 'smooth' })` argument overrides the
 * stylesheet, and a requestAnimationFrame loop never consults it at all. This is
 * the JS half of the same preference.
 */
export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
