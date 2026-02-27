import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { simpleWebCore, useSimpleWebCore } from '@chatic/web-core';

export const useSocketAuth = () => {
    const { emit } = useWebSocketV2();
    const { isAuthenticated } = useSimpleWebCore();

    useEffect(() => {
        if (!isAuthenticated) return;
        const token = simpleWebCore.getToken();
        if (!token) return;
        emit({ type: 'auth', action: 'update', payload: { token } });
    }, [isAuthenticated]);
};
