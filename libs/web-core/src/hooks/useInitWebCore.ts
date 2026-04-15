import { useEffect, useRef, useState } from 'react';

import { useWebCoreStore } from '../stores';

export const useInitWebCore = () => {
    const { initialize, isInitialized } = useWebCoreStore();
    const [localInitState, setLocalInitState] = useState<'idle' | 'initializing' | 'completed'>('idle');
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (hasInitialized.current || localInitState !== 'idle') {
            return;
        }

        hasInitialized.current = true;
        setLocalInitState('initializing');

        const runInitialization = async () => {
            try {
                await initialize();
                setLocalInitState('completed');
            } catch (error) {
                console.error('❌ WebCore initialization failed:', error);
                // TODO: error fallback
                setLocalInitState('completed');
            }
        };

        runInitialization();
    }, [initialize]);

    return isInitialized && localInitState === 'completed';
};
