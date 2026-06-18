import { useCallback } from 'react';

import { loadRelayProfile } from '../../session';

/**
 * Loads the active relay profile and hydrates session identity state.
 */
export const useProfile = () => {
    const loadProfile = useCallback(async () => loadRelayProfile(), []);

    return { loadProfile };
};
