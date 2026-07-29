import { useMemo } from 'react';

// Concrete module import (not the ../socket barrel): connection tests intercept the barrel to stub
// bootstrap/reauth, and the delegate factory must stay real there.
import { createSocketSessionDelegate } from '../socket/auth/sessionDelegate';
import type { SocketSessionDelegate } from '../socket';

/**
 * React wrapper over createSocketSessionDelegate (socket/auth/sessionDelegate.ts) — see that
 * factory for the delegate contract. This lives inside app-runtime — which already depends on
 * web-core — so apps no longer inject a delegate.
 *
 * The returned delegate is stable (its members are all module-level web-core functions), so the
 * SocketBinder effects do not re-bootstrap on re-render.
 */
export const useSocketSessionDelegate = (): SocketSessionDelegate => {
    return useMemo<SocketSessionDelegate>(() => createSocketSessionDelegate(), []);
};
