import { useCallback } from 'react';

import { logoutSession } from '@chatic/app-runtime';
import type { LogoutOptions } from '@chatic/web-core';

/**
 * Terminates the active relay session via app-runtime's `logoutSession`: best-effort socket
 * `auth.logout` then web-core's local session teardown (clears tokens/credentials + redirect; there
 * is no server-side revoke endpoint). Drop-in for the legacy web-core `useSessionLogout` — apps/web
 * uses this one so the socket is notified; admin/desktop-web keep the web-core hook.
 */
export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutSession(options), []);
