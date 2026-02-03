import { useState } from 'react';

import { useInterval } from './useInterval';

/**
 * Hook that forces component re-render at a specified interval
 * Useful for updating relative time displays
 * @param intervalMs - Interval in milliseconds (default: 1000)
 * @returns Current tick count
 */
export const useTick = (intervalMs = 1000): number => {
    const [tick, setTick] = useState(0);

    useInterval(() => {
        setTick(t => t + 1);
    }, intervalMs);

    return tick;
};
