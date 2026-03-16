import { useCallback } from 'react';

import { useNavigateWithTransition } from './useNavigateWithTransition';

/**
 * Convenience hook for back navigation with transition.
 *
 * @example
 * ```tsx
 * const goBack = useGoBack();
 * <button onClick={goBack}>Back</button>
 * ```
 */
export const useGoBack = (): (() => void) => {
    const navigate = useNavigateWithTransition();

    return useCallback(() => {
        navigate(-1);
    }, [navigate]);
};
