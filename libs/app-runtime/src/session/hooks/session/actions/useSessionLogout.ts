import { useCallback } from 'react';

import type { LogoutOptions } from '@chatic/auth';

import { logoutSession } from '../../../sessionCommands';

/**
 * Terminates the active relay session through the engine's `logout` command: best-effort socket
 * `auth.logout` then web-core's local session teardown (clears tokens/credentials + redirect; there
 * is no server-side revoke endpoint). Notifies the socket before teardown so the server ends the
 * auth session.
 */
export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutSession(options), []);
