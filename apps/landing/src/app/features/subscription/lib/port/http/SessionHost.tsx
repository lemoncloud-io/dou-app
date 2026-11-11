import { type JSX, type ReactNode } from 'react';

import { runtime } from '@chatic/app-runtime';

/**
 * The relay session's host: restores a stored session as the page loads and keeps it fresh over its
 * socket, the only way the session is renewed. It never makes a guest session — the account surface
 * has no session until someone signs in — which is why the admin console uses the same host.
 */
export const SessionHost = ({ children }: { children: ReactNode }): JSX.Element => (
    <runtime.connection.RuntimeAuthHost>{children}</runtime.connection.RuntimeAuthHost>
);
