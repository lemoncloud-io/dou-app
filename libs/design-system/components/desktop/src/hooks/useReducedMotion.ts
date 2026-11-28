import { useMediaQuery } from './useMediaQuery';

export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
