import { useEffect, useRef } from 'react';
import { getSocketManager, getSocketRuntime } from '../socket/runtime';
import type { RuntimeBinding } from '../runtime';

export interface SocketBinderProps {
    binding: RuntimeBinding;
}

export const SocketBinder = ({ binding }: SocketBinderProps) => {
    const socketRuntime = getSocketRuntime();
    const socketManager = getSocketManager();
    const prevSocketRef = useRef<string>('');

    useEffect(() => {
        const currentSocketStr = JSON.stringify(binding.socket);
        if (prevSocketRef.current !== currentSocketStr) {
            prevSocketRef.current = currentSocketStr;
            if (!binding.socket) {
                socketRuntime.controller.destroy();
                socketManager.destroy();
            } else {
                void socketRuntime.controller.bootstrap(binding.socket.config, binding.socket.scope);
            }
        }
    }, [binding.socket, socketManager, socketRuntime.controller]);

    return null;
};
