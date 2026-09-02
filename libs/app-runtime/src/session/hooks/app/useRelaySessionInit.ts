import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { markSessionInitialized } from '../../store';
import { initializeRelaySession } from '../../auth/services';
import { useSessionAuth } from '../session/readers/useSessionAuth';

type InitState = 'idle' | 'initializing' | 'completed';

const MAX_INIT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Bootstraps relay session initialization once for the current app runtime.
 */
export const useRelaySessionInit = () => {
    const { isInitialized } = useSessionAuth();
    const [localInitState, setLocalInitState] = useState<InitState>('idle');
    const hasInitialized = useRef(false);
    const retryCountRef = useRef(0);

    const runInitialization = useCallback(async () => {
        try {
            logger.debug('WEB_CORE', 'Starting initialization attempt', {
                data: { retry: retryCountRef.current },
            });
            await initializeRelaySession();
            logger.debug('WEB_CORE', 'Initialization completed successfully');
            setLocalInitState('completed');
            retryCountRef.current = 0;
        } catch (error) {
            logger.error('WEB_CORE', 'Relay session init failed', { error });

            if (retryCountRef.current < MAX_INIT_RETRIES) {
                retryCountRef.current++;
                logger.debug('WEB_CORE', 'Retrying initialization', {
                    data: { retryCount: retryCountRef.current, maxRetries: MAX_INIT_RETRIES },
                });
                setTimeout(() => {
                    void runInitialization();
                }, RETRY_DELAY_MS * retryCountRef.current);
            } else {
                logger.error('WEB_CORE', 'Relay session init failed after all retries, forcing app render');
                markSessionInitialized();
                setLocalInitState('completed');
            }
        }
    }, []);

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
