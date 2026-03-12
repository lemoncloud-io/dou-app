import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useWebCoreStore, webCore } from '@chatic/web-core';

export const useSocketAuth = () => {
    const { emit, isConnected } = useWebSocketV2();
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);

    useEffect(() => {
        if (!isAuthenticated || !isConnected) return;

        const sendAuth = async () => {
            const token =
                cloudCore.getIdentityToken() ?? (await webCore.getTokenSignature()).originToken?.identityToken;
            if (!token) return;
            emit({ type: 'auth', action: 'update', payload: { token } });
        };

        void sendAuth();
    }, [isAuthenticated, isConnected]);
};
