import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebCoreStore } from '../stores';

type InitState = 'idle' | 'initializing' | 'completed';

const MAX_INIT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export const useInitWebCore = () => {
    const { initialize, isInitialized } = useWebCoreStore();
    const [localInitState, setLocalInitState] = useState<InitState>('idle');
    const hasInitialized = useRef(false);
    const retryCountRef = useRef(0);

    const runInitialization = useCallback(async () => {
        try {
            await initialize();
            setLocalInitState('completed');
            retryCountRef.current = 0;
        } catch (error) {
            console.error('❌ WebCore initialization failed:', error);

            if (retryCountRef.current < MAX_INIT_RETRIES) {
                retryCountRef.current++;
                console.log(`🔄 Retrying initialization (${retryCountRef.current}/${MAX_INIT_RETRIES})...`);
                setTimeout(() => {
                    void runInitialization();
                }, RETRY_DELAY_MS * retryCountRef.current);
            } else {
                // All retries exhausted — allow app to render so user can interact (logout, etc.)
                console.error('❌ WebCore initialization failed after all retries, proceeding with error state');
                setLocalInitState('completed');
            }
        }
    }, [initialize]);

    useEffect(() => {
        if (hasInitialized.current || localInitState !== 'idle') {
            return;
        }

        hasInitialized.current = true;
        setLocalInitState('initializing');

        void runInitialization();
    }, [runInitialization, localInitState]);

    return isInitialized && localInitState === 'completed';
};
