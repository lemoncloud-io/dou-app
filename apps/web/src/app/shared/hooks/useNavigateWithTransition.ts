import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import type { NavigateOptions, To } from 'react-router-dom';

/** CSS class added to document element during back navigation for reverse animation */
const BACK_NAVIGATION_CLASS = 'back-navigation';

/** Options for navigation with view transitions */
export interface TransitionNavigateOptions extends NavigateOptions {
    /**
     * Whether to use view transition animation.
     * @default true
     */
    transition?: boolean;
}

/** Navigate function with view transition support */
export type NavigateWithTransitionFn = (to: To | number, options?: TransitionNavigateOptions) => void;

/**
 * A wrapper hook around useNavigate that adds view transition support.
 * By default, all navigations will use view transitions.
 *
 * @example
 * ```tsx
 * const navigate = useNavigateWithTransition();
 *
 * // Forward navigation with transition (default)
 * navigate('/settings');
 *
 * // Back navigation with transition
 * navigate(-1);
 *
 * // Navigation without transition (for tab switches)
 * navigate('/explore', { transition: false });
 * ```
 */
export const useNavigateWithTransition = (): NavigateWithTransitionFn => {
    const navigate = useNavigate();

    const navigateWithTransition = useCallback(
        (to: To | number, options?: TransitionNavigateOptions) => {
            const { transition = true, ...navigateOptions } = options ?? {};

            // Skip transition if not supported or disabled
            if (!transition || !document.startViewTransition) {
                if (typeof to === 'number') {
                    navigate(to);
                } else {
                    navigate(to, navigateOptions);
                }
                return;
            }

            // Handle numeric navigation (e.g., -1 for back)
            if (typeof to === 'number') {
                const isBack = to < 0;

                // Add back-navigation class for reverse animation
                if (isBack) {
                    document.documentElement.classList.add(BACK_NAVIGATION_CLASS);
                }

                const viewTransition = document.startViewTransition(() => {
                    navigate(to);
                });

                // Remove class after transition completes
                viewTransition.finished.finally(() => {
                    document.documentElement.classList.remove(BACK_NAVIGATION_CLASS);
                });
            } else {
                // For path navigation, use startViewTransition
                document.startViewTransition(() => {
                    navigate(to, navigateOptions);
                });
            }
        },
        [navigate]
    );

    return navigateWithTransition;
};

/**
 * Convenience hook for back navigation with transition.
 *
 * @example
 * ```tsx
 * const goBack = useGoBack();
 * <button onClick={goBack}>Back</button>
 * ```
 */
export const useGoBack = () => {
    const navigate = useNavigateWithTransition();

    return useCallback(() => {
        navigate(-1);
    }, [navigate]);
};
