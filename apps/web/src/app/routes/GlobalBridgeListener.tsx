import { useEffect } from 'react';
import type { JSX } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { logger, webClient } from '@chatic/bridges';
import { useOnNavigate, useOnBackgroundStatusChanged } from '../shared/hooks';

export const GlobalBridgeListener = (): JSX.Element => {
    const navigate = useNavigate();

    useOnNavigate(message => {
        const { path, replace } = message.data;
        logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
        try {
            navigate(path, { replace: !!replace });
        } catch (error) {
            logger.error('ROUTER', `Failed to navigate to: ${path}`, { error });
        }
    });

    const sendDismissSignal = () => {
        logger.info('ROUTER', 'Sending DismissResumeOverlay signal');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                webClient.post({ type: 'DismissResumeOverlay', data: {} });
            });
        });
    };

    useOnBackgroundStatusChanged(message => {
        const { isForeground } = message.data;
        if (isForeground) {
            logger.info('ROUTER', 'Web app received OnBackgroundStatusChanged(foreground), triggering dismiss signal');
            sendDismissSignal();
        }
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                logger.info('ROUTER', 'Web app became visible (visibilitychange), triggering dismiss signal');
                sendDismissSignal();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return <Outlet />;
};
