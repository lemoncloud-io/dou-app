import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { useWebCoreStore } from '../stores';
import { reportError } from '../api';

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
            logger.info('WEB_CORE', 'Starting initialization attempt', {
                data: { retry: retryCountRef.current },
            });
            await initialize();
            logger.info('WEB_CORE', 'Initialization completed successfully');
            setLocalInitState('completed');
            retryCountRef.current = 0;
        } catch (error) {
            logger.error('WEB_CORE', 'WebCore initialization failed', { error });
            reportError(error instanceof Error ? error : new Error(String(error)));

            if (retryCountRef.current < MAX_INIT_RETRIES) {
                retryCountRef.current++;
                logger.info('WEB_CORE', 'Retrying initialization', {
                    data: { retryCount: retryCountRef.current, maxRetries: MAX_INIT_RETRIES },
                });
                setTimeout(() => {
                    void runInitialization();
                }, RETRY_DELAY_MS * retryCountRef.current);
            } else {
                // All retries exhausted — force isInitialized so Router can render
                // and user can interact (logout, retry, etc.)
                logger.error('WEB_CORE', 'WebCore initialization failed after all retries, forcing app render');
                useWebCoreStore.setState({ isInitialized: true });
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
