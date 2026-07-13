// web-core's cloud teardown shares this name; alias it so the app-runtime export below can own it.
import { logoutCloudSession as clearCloudCoreSession } from '@chatic/web-core';

import { notifySocketLogout } from './logoutSession';

/**
 * Leaves the active cloud while keeping the relay session intact (multi-socket-design.md §8-5) —
 * owned by app-runtime now that the cloud socket is notified on logout.
 *
 * Steps (mirrors {@link logoutSession} but scoped to cloud):
 *  1. best-effort `auth.logout()` on the CLOUD slot only (fire-and-forget) — the relay socket is
 *     untouched.
 *  2. web-core cloud teardown clears cloudCore. That drops `cloud.isActive`, so the binding
 *     removes the cloud slot and SocketBinder tears the cloud client down — relay stays connected.
 */
export const logoutCloudSession = async (): Promise<void> => {
    notifySocketLogout('cloud');
    clearCloudCoreSession();
};
