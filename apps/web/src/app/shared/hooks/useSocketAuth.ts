import { useEffect } from 'react';

import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';
import { getSocketManager, useSocketState } from '../socket';

export const useSocketAuth = () => {
    const isConnected = useSocketState(state => state.isConnected);
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);

    useEffect(() => {
        if (!isAuthenticated || !isConnected) return;

        const sendAuth = async () => {
            const client = getSocketManager().getActiveClient();
            const token =
                cloudCore.getIdentityToken() ?? (await webCore.getTokenSignature()).originToken?.identityToken;
            if (!client || !token) return;
            await client.request('auth.update' as any, { token });
        };

        void sendAuth();
    }, [isAuthenticated, isConnected]);
};
