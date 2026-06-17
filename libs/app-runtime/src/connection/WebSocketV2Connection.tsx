import { useEffect } from 'react';

import { useCloudSession, useCloudTokenRefresh } from '../hooks';
import { getRuntimeManager, type RuntimeBinding } from '../runtime';

export const WebSocketV2Connection = ({ binding }: { binding: RuntimeBinding }) => {
    const { isPending } = useCloudSession();
    const runtimeManager = getRuntimeManager();

    useEffect(() => {
        if (isPending || !binding.socket) return;
        void runtimeManager.bootstrap(binding);
    }, [runtimeManager, isPending, binding]);

    useCloudTokenRefresh();

    return null;
};
