import { useEffect } from 'react';

import { useAppForeground } from '../bridge';
import { queueLossObserver } from './logging/queueLossObserver';

const OBSERVE_INTERVAL_MS = 5 * 60_000;

export const QueueLossRunner = (): null => {
    useEffect(() => {
        const timer = setInterval(() => queueLossObserver.observe(), OBSERVE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    useAppForeground(() => queueLossObserver.observe());

    return null;
};
