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
    const prevAuthRef = useRef<string>('');
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const currentSocketStr = JSON.stringify(binding.socket);
        const currentAuthStr = JSON.stringify(binding.auth);

        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            prevSocketRef.current = currentSocketStr;
            prevAuthRef.current = currentAuthStr;
            return;
        }

        const didSocketChange = prevSocketRef.current !== currentSocketStr;
        const didAuthChange = prevAuthRef.current !== currentAuthStr;

        prevSocketRef.current = currentSocketStr;
        prevAuthRef.current = currentAuthStr;

        if (!binding.socket || !binding.auth?.identityToken || !didAuthChange || didSocketChange) {
            return;
        }

        socketManager.markUnverified();
        void socketRuntime.controller.updateAuth('session-switch');
    }, [binding.auth, binding.socket, socketManager, socketRuntime.controller]);

    return null;
};
