import { useSyncExternalStore } from 'react';

import { getSocketManager } from '../socket/runtime';
import type { SocketKind } from '../socket';

/**
 * Reactively tracks whether a SPECIFIC socket slot (`kind`) is auth-verified, independent of which
 * slot is ACTIVE.
 *
 * `useRuntimeSocketState().isVerified` tracks the active slot (cloud when bound, else relay) — it
 * cannot express "relay is up" while a cloud slot is active, or vice versa. Anything gating a
 * request pinned via `getScopedClient(kind)` (e.g. the relay-only invite gateway) must gate on this
 * instead, or it races the wrong slot's handshake.
 */
export const useKindVerified = (kind: SocketKind): boolean => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribeKindVerified(kind, listener),
        () => manager.isKindVerified(kind)
    );
};
