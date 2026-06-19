import { useCallback } from 'react';

import { type LogoutOptions, logoutRelaySession } from '../../../session';

/**
 * Returns a stable callback that terminates the active relay session.
 */
export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutRelaySession(options), []);
