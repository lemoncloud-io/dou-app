import { useEffect, useRef } from 'react';
import { getSocketManager, getSocketRuntime } from '../socket/runtime';
import type { RuntimeBinding } from '../runtime';

export interface SocketAuthBinderProps {
    binding: RuntimeBinding;
}

export const SocketAuthBinder = ({ binding }: SocketAuthBinderProps) => {
    const socketRuntime = getSocketRuntime();
    const socketManager = getSocketManager();
    const prevSocketRef = useRef<string>('');
    const prevTokenRef = useRef<string>('');
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const currentSocketStr = JSON.stringify(binding.socket);
        // Re-auth keys off the identity token only. A site switch pre-applies the new sid
        // optimistically while the token is still the old one; re-authing then would send
        // the stale token. Channel lists are scoped by the session token (not sid), so we
        // must wait for the new token to commit before re-authing.
        const currentToken = binding.auth?.identityToken ?? '';

        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            prevSocketRef.current = currentSocketStr;
            prevTokenRef.current = currentToken;
            return;
        }

        const didSocketChange = prevSocketRef.current !== currentSocketStr;
        const didTokenChange = prevTokenRef.current !== currentToken;

        prevSocketRef.current = currentSocketStr;
        prevTokenRef.current = currentToken;

        // A socket replacement is bootstrapped (with auth) by SocketBinder, so skip here.
        if (!binding.socket || !currentToken || !didTokenChange || didSocketChange) {
            return;
        }

        socketManager.markUnverified();
        void socketRuntime.sessionController.updateAuth('session-switch');
    }, [binding.auth, binding.socket, socketManager, socketRuntime.sessionController]);

    return null;
};
