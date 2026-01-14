import { useEffect } from 'react';

export const useTabVisibilityWebSocket = (
    isTabVisible: boolean,
    connect: () => Promise<void>,
    disconnect: () => void
) => {
    useEffect(() => {
        if (isTabVisible) {
            console.log('[TabVisibilityWebSocket] Tab foreground - connecting');
            void connect();
        } else {
            console.log('[TabVisibilityWebSocket] Tab background - disconnecting');
            disconnect();
        }
    }, [isTabVisible, connect, disconnect]);
};
