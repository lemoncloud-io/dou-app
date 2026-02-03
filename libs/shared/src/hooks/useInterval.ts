import { useEffect, useRef } from 'react';

/**
 * Hook that runs a callback at a specified interval
 * @param callback - Function to call on each interval
 * @param delay - Interval delay in milliseconds (null to pause)
 */
export const useInterval = (callback: () => void, delay: number | null): void => {
    const savedCallback = useRef(callback);

    // Remember the latest callback
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Set up the interval
    useEffect(() => {
        if (delay === null) {
            return;
        }

        const tick = () => {
            savedCallback.current();
        };

        const id = setInterval(tick, delay);
        return () => clearInterval(id);
    }, [delay]);
};
