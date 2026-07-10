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
 * Reacts to `binding.socket` changes: boots (or tears down) the socket via the pure
 * `bootstrapSocketConnection`. Bootstrap is async and returns a cleanup that detaches the SDK auth
 * subscriptions; we track it through a ref plus an `active` flag so a rapid re-bind or an unmount
 * during an in-flight bootstrap still detaches the previous connection's subscriptions.
 */
export const SocketBinder = ({ binding, delegate }: SocketBinderProps) => {
    const socketManager = getSocketManager();
    const prevSocketRef = useRef<string>('');
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const currentSocketStr = JSON.stringify(binding.socket);
        if (prevSocketRef.current === currentSocketStr) {
            return;
        }
        prevSocketRef.current = currentSocketStr;

        // Detach the previous connection's auth subscriptions, then tear down the previous socket.
        // Single-socket (Phase 2c): any binding.socket change is a reboot, so destroy ALL slots — a
        // relay↔cloud switch changes the kind and the stale slot must not linger. Phase 2d makes
        // this per-kind so the relay + cloud slots can coexist.
        cleanupRef.current?.();
        cleanupRef.current = null;
        socketManager.destroy();

        if (!binding.socket) {
            return;
        }

        let active = true;
        void bootstrapSocketConnection({ manager: socketManager, config: binding.socket.config, delegate })
            .then(cleanup => {
                // A newer bind (or unmount) landed while bootstrap was in flight — detach immediately.
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
    }, [binding.socket, socketManager, delegate]);

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
