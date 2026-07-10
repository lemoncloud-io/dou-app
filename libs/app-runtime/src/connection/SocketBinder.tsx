import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { getSocketManager } from '../socket/runtime';
import { bootstrapSocketConnection } from '../socket';
import type { SocketSessionDelegate } from '../socket';
import type { RuntimeBinding } from '../runtime';

export interface SocketBinderProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
}

/**
 * Boots (or tears down) the socket via the pure `bootstrapSocketConnection` when the socket
 * IDENTITY changes.
 *
 * The reboot key is `url|deviceId|wssType` — deliberately NOT the full `binding.socket` (which
 * includes `cid`). Two reasons:
 *   1. `binding.socket` is a fresh object on every session mutation (useMemo over the session
 *      snapshot), so keying the effect on it would re-run on every benign re-render and could detach
 *      an in-flight bootstrap's SDK auth subscriptions — leaving a connected-but-unverified socket
 *      whose token writeback is severed. Keying on the stable string avoids that.
 *   2. A cid-only flip is an OPTIMISTIC cloud switch (cid pre-applied before tokens commit).
 *      Rebooting then would re-freeze the socket's boundCid to the target cloud while it is still
 *      attached to the outgoing cloud, defeating dropForeignFrame and poisoning the target cache
 *      partition. Skipping the reboot keeps boundCid frozen; RuntimeDataBinder handles the cid flip
 *      separately (multi-socket-design.md §6-9/§8-4).
 *
 * The live config (incl. cid) is read from a ref at bootstrap time, so a genuine reboot still passes
 * the current cid to `ensure`.
 */
export const SocketBinder = ({ binding, delegate }: SocketBinderProps) => {
    const socketManager = getSocketManager();
    const cleanupRef = useRef<(() => void) | null>(null);

    const config = binding.socket?.config;
    const rebootKey = config ? `${config.url}|${config.deviceId}|${config.wssType ?? 'relay'}` : '';
    // Latest config (incl. optimistic cid) — read inside the effect so a genuine reboot uses it,
    // while a cid-only change (same rebootKey) does not re-run the effect.
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        // Detach the previous connection's auth subscriptions, then tear down the previous socket.
        // Single-socket (Phase 2c): a rebootKey change is a genuine socket-identity change, so
        // destroy ALL slots — a relay↔cloud switch changes the kind and the stale slot must not
        // linger. Phase 2d makes this per-kind so relay + cloud slots can coexist.
        cleanupRef.current?.();
        cleanupRef.current = null;
        socketManager.destroy();

        const current = configRef.current;
        if (!current) {
            return;
        }

        let active = true;
        void bootstrapSocketConnection({ manager: socketManager, config: current, delegate })
            .then(cleanup => {
                // A newer reboot (or unmount) landed while bootstrap was in flight — detach immediately.
                if (!active) {
                    cleanup();
                    return;
                }
                cleanupRef.current = cleanup;
            })
            .catch(error => {
                logger.error('SOCKET', '[SocketBinder] bootstrap failed', { error });
            });

        return () => {
            active = false;
        };
        // Keyed on rebootKey (not binding.socket) so benign re-renders and cid-only flips do not
        // re-run this effect. `config` is read via configRef.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rebootKey, socketManager, delegate]);

    // Detach on unmount so the last connection's subscriptions do not leak.
    useEffect(
        () => () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        },
        []
    );

    return null;
};
