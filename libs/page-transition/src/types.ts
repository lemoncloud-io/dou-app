import type { NavigateOptions, To } from 'react-router-dom';

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
