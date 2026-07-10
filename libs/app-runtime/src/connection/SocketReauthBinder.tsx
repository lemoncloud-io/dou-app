import { useEffect, useRef } from 'react';

import { getSocketManager } from '../socket/runtime';
import { reauthenticateActiveSocket } from '../socket';
import type { SocketBindingConfig, SocketSessionDelegate } from '../socket';
import type { RuntimeBinding } from '../runtime';

export interface SocketReauthBinderProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
}

/**
 * Reboot signature of the two slots — the SAME key SocketBinder reboots on (`url|deviceId|wssType`),
 * deliberately EXCLUDING `cid`. A same-wss cloud switch (cid-only config change) must NOT count as a
 * reboot here: SocketBinder does not reboot it, so this binder must re-authenticate it instead (§8-4).
 */
const rebootSignature = (binding: RuntimeBinding): string => {
    const key = (config?: SocketBindingConfig) =>
        config ? `${config.url}|${config.deviceId}|${config.wssType ?? ''}` : '';
    return `${key(binding.socket.relay?.config)}#${key(binding.socket.cloud?.config)}`;
};

/**
 * Re-authenticates the live socket when the session identity changes ON THE SAME connection while the
 * socket is NOT rebooting. Two cases:
 *   - guest→social/email promotion: web-core swaps the relay token while url/deviceId/wssType stay.
 *   - same-wss cloud switch (§8-4): the cloud token changes and only `cid` moves in the config, which
 *     SocketBinder ignores (its reboot key excludes cid) — so the SDK still holds the old identity.
 *
 * Keyed on `binding.auth.identityToken` gated by the reboot signature (`rebootSignature`, cid-blind):
 * a genuine reboot (url/deviceId/wssType change) is handled by SocketBinder via bootstrapSocketConnection,
 * so this skips those to avoid a double register. The actual work + the feedback-loop guard (SDK-driven
 * refresh writeback also changes the token but must NOT trigger re-auth) live in
 * reauthenticateActiveSocket, which no-ops when the token already matches the SDK's.
 */
export const SocketReauthBinder = ({ binding, delegate }: SocketReauthBinderProps) => {
    const socketManager = getSocketManager();
    const prevSocketRef = useRef<string>('');
    const prevTokenRef = useRef<string>('');
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const socketStr = rebootSignature(binding);
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

        // No active token (logged out), no change, or a reboot (SocketBinder re-registers) → skip.
        // A genuine same-socket identity change (guest→social) is a change to the ACTIVE server, so
        // re-auth that server's kind.
        if (!token || !tokenChanged || socketChanged) {
            return;
        }

        void reauthenticateActiveSocket({
            manager: socketManager,
            delegate,
            kind: binding.auth?.kind ?? 'relay',
        });
    }, [binding.auth?.identityToken, binding.auth?.kind, binding.socket, socketManager, delegate]);

    return null;
};
