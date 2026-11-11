import { useEffect, useState } from 'react';

import { startOfDay } from '../utils';

/**
 * Midnight of the current local day, as a number that changes when the day does — so a feed left open
 * overnight re-renders into the new day instead of waiting for its next message.
 */
export const useStartOfToday = (): number => {
    const [today, setToday] = useState(() => startOfDay(Date.now()));

    useEffect(() => {
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        // A second past midnight: a timer that fires early would set the same day and never rearm.
        const timer = setTimeout(() => setToday(startOfDay(Date.now())), midnight.getTime() - Date.now() + 1000);
        return () => clearTimeout(timer);
    }, [today]);

    return today;
};
