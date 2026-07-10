import { useEffect, useRef } from 'react';

import { getSocketManager } from '../socket/runtime';
import { reauthenticateActiveSocket } from '../socket';
import type { SocketSessionDelegate } from '../socket';
import type { RuntimeBinding } from '../runtime';

export interface SocketReauthBinderProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
}

/**
 * Re-authenticates the live socket when the session identity changes ON THE SAME connection
 * (guest→social/email promotion): web-core swaps the relay token while url/deviceId/wssType stay,
 * so SocketBinder does not reboot and the SDK still holds the old identity.
 *
 * Keyed on `binding.auth.identityToken`. A socket-config change (reboot) is handled by SocketBinder
 * via bootstrapSocketConnection, so this skips those. The actual work + the feedback-loop guard
 * (SDK-driven refresh writeback also changes the token but must NOT trigger re-auth) live in
 * reauthenticateActiveSocket, which no-ops when the token already matches the SDK's.
 */
export const SocketReauthBinder = ({ binding, delegate }: SocketReauthBinderProps) => {
    const socketManager = getSocketManager();
    const prevSocketRef = useRef<string>('');
    const prevTokenRef = useRef<string>('');
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const socketStr = JSON.stringify(binding.socket);
        const token = binding.auth?.identityToken ?? '';

        // First render: the socket is freshly bootstrapped (or absent). Seed the refs and skip.
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            prevSocketRef.current = socketStr;
            prevTokenRef.current = token;
            return;
        }

        const socketChanged = prevSocketRef.current !== socketStr;
        const tokenChanged = prevTokenRef.current !== token;
        prevSocketRef.current = socketStr;
        prevTokenRef.current = token;

        // No socket, no token, no change, or a reboot (SocketBinder re-registers) → nothing to do.
        if (!binding.socket || !token || !tokenChanged || socketChanged) {
            return;
        }

        void reauthenticateActiveSocket({ manager: socketManager, delegate });
    }, [binding.auth?.identityToken, binding.socket, socketManager, delegate]);

    return null;
};
