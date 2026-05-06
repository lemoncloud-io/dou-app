import { useEffect } from 'react';

import { logger } from '@chatic/app-messages';

export const useTabVisibilityWebSocket = (
    isTabVisible: boolean,
    connect: () => Promise<void>,
    disconnect: () => void
) => {
    useEffect(() => {
        if (isTabVisible) {
            logger.info('SOCKET', '[TabVisibilityWebSocket] Tab foreground - connecting');
            void connect();
        } else {
            logger.info('SOCKET', '[TabVisibilityWebSocket] Tab background - disconnecting');
            disconnect();
        }
    }, [isTabVisible, connect, disconnect]);
};
