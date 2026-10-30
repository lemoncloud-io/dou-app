import { useCallback } from 'react';

import { logoutSession } from '@chatic/auth';
import type { LogoutOptions } from '@chatic/auth';

/**
 * Terminates the active relay session via app-runtime's `logoutSession`: best-effort socket
 * `auth.logout` then web-core's local session teardown (clears tokens/credentials + redirect; there
 * is no server-side revoke endpoint). Notifies the socket before teardown so the server ends the
 * auth session.
 */
export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutSession(options), []);
