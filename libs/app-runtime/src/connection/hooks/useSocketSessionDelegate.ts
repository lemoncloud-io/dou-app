import { useMemo } from 'react';

// Connection tests mock the bootstrap and re-auth modules by their own paths, so the delegate factory,
// which lives in a module of its own, stays real there.
import { createSocketSessionDelegate } from '@chatic/auth';
import type { SocketSessionDelegate } from '@chatic/auth';

/**
 * React wrapper over createSocketSessionDelegate (`@chatic/auth`'s socket/sessionDelegate.ts) — see that
 * factory for the delegate contract. This lives inside app-runtime — which already depends on
 * web-core — so apps no longer inject a delegate.
 *
 * The returned delegate is stable (its members are all module-level web-core functions), so the
 * SocketBinder effects do not re-bootstrap on re-render.
 */
export const useSocketSessionDelegate = (): SocketSessionDelegate => {
    return useMemo<SocketSessionDelegate>(() => createSocketSessionDelegate(), []);
};
