import { useEffect, useRef } from 'react';

export const useInterval = (callback: () => void, delay: number | null): void => {
    const savedCallback = useRef(callback);

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

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
